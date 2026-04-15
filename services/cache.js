import logger from './logger.js';
class Cache{constructor(){this.cache=new Map();this.timers=new Map();}
set(key,value,ttl=null){if(this.timers.has(key))clearTimeout(this.timers.get(key));this.cache.set(key,value);if(ttl){const timer=setTimeout(()=>{this.delete(key);logger.debug(`Cache expired: ${key}`);},ttl*1000);this.timers.set(key,timer);}}
get(key){return this.cache.get(key);}
has(key){return this.cache.has(key);}
delete(key){if(this.timers.has(key)){clearTimeout(this.timers.get(key));this.timers.delete(key);}return this.cache.delete(key);}
clear(){this.timers.forEach(timer=>clearTimeout(timer));this.timers.clear();this.cache.clear();}
stats(){return {size:this.cache.size,keys:Array.from(this.cache.keys())};}}
export default new Cache();
