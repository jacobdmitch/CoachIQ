import logger from '../services/logger.js';
export const errorHandler=(err,req,res,next)=>{logger.error('Unhandled error:',{message:err.message,statusCode:err.statusCode||500});const statusCode=err.statusCode||500;const message=err.message||'Internal server error';const response={error:message,...(process.env.NODE_ENV!=='production'&&{stack:err.stack})};res.status(statusCode).json(response);};
export const asyncHandler=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export class AppError extends Error{constructor(message,statusCode=500){super(message);this.statusCode=statusCode;this.timestamp=new Date().toISOString();}}
export default errorHandler;
