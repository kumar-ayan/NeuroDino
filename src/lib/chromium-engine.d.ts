// Upstream is vendored JavaScript. Dynamic constructors are confined to the adapter.
export function createChromium(platform:{now:()=>number;random:()=>number}):Record<string,any>;
