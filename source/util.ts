
import * as fs from 'fs';

export let readFile = (path: string): Promise<Buffer> => new Promise((resolve, reject) => fs.readFile(path, (e, data) => e ? reject(e) : resolve(data)));

export let moveFile = (from: string, to: string): Promise<Buffer> => new Promise((resolve, reject) => fs.rename(from, to, (e) => e ? reject(e) : resolve()));

export let writeFile = (path: string): Promise<Buffer> => new Promise((resolve, reject) => fs.readFile(path, (e, data) => e ? reject(e) : resolve(data)));

export let appendFile = (path: string, text: string): Promise<void> => new Promise((resolve, reject) => fs.appendFile(path, text, (e) => e ? reject(e) : resolve()));

export let deleteFile = (path: string): Promise<Buffer> => new Promise((resolve, reject) => fs.unlink(path, (e) => e ? reject(e) : resolve()));

export let readDir = (path: string): Promise<string[]> => new Promise((resolve, reject) => fs.readdir(path, (e, files) => e ? reject(e) : resolve(files)));

export let mkDir = (path: string): Promise<void> => new Promise((resolve, reject) => fs.mkdir(path, (e) => e ? reject(e) : resolve()));

/**
 * todo - replace with node Buffer functionality
 */
export let strToHex = (s: string): string => {
  let i, l, o = '', n;
  s += '';
  for (i = 0, l = s.length; i < l; i++) {
    n = s.charCodeAt(i).toString(16);
    o += n.length < 2 ? '0' + n : n;
  }
  return o;
};

/**
 * todo - replace with node Buffer functionality
 */
export let uint8ToStr = (u8a: Uint8Array): string => {
  let CHUNK_SZ = 0x8000;
  let c = [];
  for (let i = 0; i < u8a.length; i += CHUNK_SZ) {
    c.push(String.fromCharCode.apply(null, u8a.subarray(i, i + CHUNK_SZ)));
  }
  return c.join('');
};

export let keyidBytesToHex = (bytes: string): string => strToHex(bytes).toUpperCase();

export let wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export let chunks = <T>(array: T[], size: number): T[][] => {
  let results = [];
  while (array.length) {
    results.push(array.splice(0, size));
  }
  return results;
};

export let lousyRandom = (length: number = 5) => {
  let id = '';
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < length; i++) {
    id += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return id;
};
