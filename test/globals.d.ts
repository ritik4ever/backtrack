declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function setup(fn: () => void | Promise<void>): void;
