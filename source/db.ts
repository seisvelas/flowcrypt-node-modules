
import * as pg from 'pg';
import * as util from './util';
import {Log} from './log';
import {Config} from './config';
import {readFileSync} from 'fs';

export type DbValue = string|boolean|number|null;

type Querier = (query: string | pg.QueryConfig, values?: any[]) => Promise<any[]>;

export class Db {

  public sql: SqlBuilder;

  private pool: pg.Pool;
  private log: Log;

  private SERIALIZATION_FAILURE_RETRIES = 20;
  private ERRCODE_SERIALIZATION_FAILURE = '40001';
  private ERRCODE_DUPLICTE_KEY_VIOLATION = '23505';

  constructor(config: Config) {
    this.log = new Log(config);
    this.sql = new SqlBuilder(this.log);
    this.log.debug('creating db pool');
    this.pool = new pg.Pool({
      user: config.DB_USER,
      host: config.DB_HOST,
      database: config.DB_NAME,
      port: config.DB_PORT,
      min: 1,
      max: 100,
      ssl: config.DB_INSECURE ? undefined : {
        rejectUnauthorized: false,
        requestCert: true,
        ca: readFileSync(`${config.DB_CERTS_PATH}/ca.crt`).toString(),
        key: readFileSync(`${config.DB_CERTS_PATH}/client.${config.DB_USER}.key`).toString(),
        cert: readFileSync(`${config.DB_CERTS_PATH}/client.${config.DB_USER}.crt`).toString(),
      },
    });
    this.log.debug('db pool created');
  }

  connection = async () => {
    this.log.debug('grabbing connection from the pool');
    let c = await this.pool.connect();
    this.log.debug('got connection from the pool');
    return c;
  }

  read = async (f: (query: Querier) => Promise<any>) => {
    let c = await this.connection();
    let r = await f(this.get_connection_querier(c));
    await c.release();
    return r;
  }

  write = async (tx_f: (query: Querier) => Promise<any>, retries=this.SERIALIZATION_FAILURE_RETRIES) => {
    let c = await this.connection();
    await c.query('BEGIN; SAVEPOINT cockroach_restart');
    try {
      while(true) {
        try {
          if(retries < this.SERIALIZATION_FAILURE_RETRIES) { // not the first try
            await util.wait(Math.round(Math.random() * 100)); // wait up to 100ms
          }
          let result = await tx_f(this.get_connection_querier(c));
          await c.query('RELEASE SAVEPOINT cockroach_restart; COMMIT');
          return result;
        } catch (e) {
          retries -= 1;
          if(e.code !== this.ERRCODE_SERIALIZATION_FAILURE) {
            throw e;
          }
          if (retries <= 0) {
            this.log.error('will not retry db tx anymore - ran out of retries');
            throw e;
          }
          this.log.debug('retrying a db transaction');
          await c.query('ROLLBACK TO SAVEPOINT cockroach_restart'); // Signal to the database that we'll retry
        }
      }
    } catch (e) {
      await c.query('ROLLBACK');  // rollback if throwing upstream
      throw e;
    } finally {
      await c.release();
    }
  }

  private get_connection_querier = (c: pg.PoolClient): Querier => {
    return async (query, values) => {
      let prepared_query = (typeof query === 'string' && values) ? this.sql.prepare(query, values) : query;
      let loggable_query = typeof prepared_query === 'string' ? prepared_query : prepared_query.text;
      try {
        let {rows} = await c.query(prepared_query);
        this.log.debug(`SQL[${loggable_query}]`);
        return rows;
      } catch(e) {
        if(e instanceof Error && e.message && e.message.indexOf('syntax error') === 0) {
          await this.log.error(`error: ${typeof prepared_query === 'string' ? prepared_query : prepared_query.text}`);
        }
        throw e;
      }
    };
  }

}

class SqlBuilder {

  private log: Log;

  constructor(log: Log) {
    this.log = log;
  }

  public insert = (table: string, columns: string, sql_pattern: string, array_of_value_arrays: DbValue[][], add:string=''): pg.QueryConfig => {
    columns = `"${columns.split(',').join('","')}"`;
    let values: DbValue[] = [];
    let rows: string[] = [];
    let i = 1;
    for(let value_array of array_of_value_arrays) {
      rows.push(sql_pattern.replace(/\$\$/g, placeholder => `$${i++}`));
      values.push.apply(values, value_array);
    }
    let text = `INSERT INTO ${table}(${columns}) VALUES (${rows.join('),(')}) ${add};`;
    return {text, values};
  }

  public prepare = (sql: string, fill_values: (DbValue|DbValue[])[]): pg.QueryConfig => {
    let i = 1;
    let fill_values_i = 0;
    let values: DbValue[] = [];
    let fillers = fill_values.length;
    let placehoders = 0;
    let text = sql.replace(/\$\$\$?/g, placeholder => {
      placehoders++;
      if(placeholder === '$$$') {
        values.push.apply(values, fill_values[fill_values_i++]);
        return values.map(v => `$${i++}`).join(',');
      } else {
        values.push(fill_values[fill_values_i++] as DbValue);
        return `$${i++}`;
      }
    });
    if (fillers !== placehoders) {
      this.log.error(`Following query with ${placehoders} placeholders was provided ${fillers} fillers:\n${sql}`);
      throw new Error(`Query with ${placehoders} placeholders was provided ${fillers} fillers`);
    }
    return {text, values};
  }

  static on_conflict = (column: string, update_columns: string[], where?: string): string => {
    return `ON CONFLICT (${column}) DO UPDATE SET ${update_columns.map(c => `${c} = excluded.${c}`).join(',')} WHERE ${where || 'TRUE'}`;
  }

}
