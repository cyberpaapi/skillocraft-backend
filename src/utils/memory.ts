export const forceGarbageCollection = () => {
  if (global.gc) {
    global.gc();
    console.log('Forced garbage collection');
  }
};

export const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`,
  };
};

export const logMemoryUsage = (context: string) => {
  const usage = getMemoryUsage();
  console.log(`Memory usage [${context}]:`, usage);
};

export const checkMemoryLimit = (limitMB: number = 1500) => {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  
  if (heapUsedMB > limitMB) {
    console.warn(`Memory usage high: ${heapUsedMB.toFixed(2)} MB (limit: ${limitMB} MB)`);
    forceGarbageCollection();
    return true;
  }
  return false;
};
