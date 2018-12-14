import * as child_process from 'child_process';
import * as set_node_cleanup_cb from 'node-cleanup';

const PROCESSES: child_process.ChildProcess[] = [];
const SPAWN_READINESS_TIMEOUT = 10 * 1000;

export class SubprocessError extends Error {
  stderr: string;
  stdout: string;
  command: (string | number)[];
  constructor(message: string, stderr: string, stdout: string, command: (string | number)[]) {
    super(message);
    this.stderr = stderr;
    this.stdout = stdout;
    this.command = command;
  }
}

export class ProcessNotReady extends SubprocessError { }

export class Subprocess {

  /**
   * user to replace this with a callback
   */
  public static onStdout = (r: { stdout: Buffer, cmd: string, args: string[] }): void => undefined;

  /**
   * user to replace this with a callback
   */
  public static onStderr = (r: { stderr: Buffer, cmd: string, args: string[] }): void => undefined;

  public static spawn = (cmd: string, rawArgs: (string | number)[], readiness_indicator?: string): Promise<child_process.ChildProcess> => new Promise((resolve, reject) => {
    const args = rawArgs.map(String);
    let p = child_process.spawn(cmd, args);
    PROCESSES.push(p);
    if (readiness_indicator) {
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', data => {
        stdout += data.toString();
        if (stdout.indexOf(readiness_indicator) !== -1) {
          resolve(p);
        }
        Subprocess.onStdout({ cmd, args, stdout: data })
      });
      p.stderr.on('data', data => {
        stderr += data.toString();
        if (stderr.indexOf(readiness_indicator) !== -1) {
          resolve(p);
        }
        Subprocess.onStderr({ cmd, args, stderr: data })
      });
      setTimeout(() => {
        reject(new ProcessNotReady(`Process did not become ready in ${SPAWN_READINESS_TIMEOUT} by outputting <${readiness_indicator}>`, stderr, stdout, [cmd].concat(rawArgs as string[])));
        p.kill();
      }, SPAWN_READINESS_TIMEOUT);
    } else {
      resolve(p);
    }
  });

  public static exec = (shell_command: string): Promise<{ stdout: string, stderr: string }> => new Promise((resolve, reject) => {
    let p: child_process.ChildProcess = child_process.exec(shell_command, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
    PROCESSES.push(p);
  });

  public static killall = (signal: 'SIGINT' | 'SIGKILL' | 'SIGTERM' = 'SIGTERM') => {
    for (let p of PROCESSES) {
      if (!p.killed) {
        p.kill(signal);
      }
    }
  };

}

set_node_cleanup_cb((exit_code, signal) => {
  Subprocess.killall('SIGTERM');
  return undefined;
});
