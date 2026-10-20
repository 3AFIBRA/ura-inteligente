declare module 'asterisk-manager' {
  export type AmiMessage = Record<string, any>;
  export type AmiCallback = (err: AmiMessage | undefined, res: AmiMessage) => void;

  export interface AmiManager {
    options: { port: number; host: string; username: string; password: string; events: boolean };
    connect(port: number, host: string, callback?: () => void): void;
    keepConnected(): void;
    login(callback?: AmiCallback): void;
    action(action: AmiMessage, callback?: AmiCallback): string;
    disconnect(callback?: () => void): void;
    isConnected(): boolean;
    connected(): boolean;
    on(event: string, listener: (...args: any[]) => void): void;
    once(event: string, listener: (...args: any[]) => void): void;
    addListener(event: string, listener: (...args: any[]) => void): void;
    removeListener(event: string, listener: (...args: any[]) => void): void;
    removeAllListeners(event?: string): void;
    listeners(event: string): Array<(...args: any[]) => void>;
    setMaxListeners(n: number): void;
    emit(event: string, ...args: any[]): boolean;
  }

  function Manager(
    port?: number | string,
    host?: string,
    username?: string,
    password?: string,
    events?: boolean,
  ): AmiManager;

  export default Manager;
}
