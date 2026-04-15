import express from 'express';
import bcrypt from 'bcrypt';
import {query} from '../services/database.js';
import logger from '../services/logger.js';
import {generateToken,generateRefreshToken} from '../middleware/auth.js';
const router=express.Router();
router.post('/login',async(req,res)=>{const{email,password}=req.body;try{const result=await query('SELECT * FROM coaches WHERE email=$1',[email.toLowerCase()]);if(result.rows.length===0)return res.status(401).json({error:'Invalid email or password'});const coach=result.rows[0];const validPassword=await bcrypt.compare(password,coach.password_hash);if(!validPassword)return res.status(401).json({error:'Invalid email or password'});const token=generateToken({coachId:coach.id,email:coach.email,role:'coach'});const refreshToken=generateRefreshToken({coachId:coach.id,email:coach.email});logger.info(`Coach logged in: ${coach.email}`);res.json({success:true,coach:{id:coach.id,email:coach.email,firstName:coach.first_name,lastName:coach.last_name},token,refreshToken});}catch(err){res.status(500).json({error:err.message});}});
router.get('/me',(req,res)=>{res.json({success:true,message:'Auth endpoint active'});});
export default router;
