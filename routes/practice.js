import express from 'express';
const router=express.Router();
router.get('/drills',(req,res)=>{res.json({success:true,drills:[],note:'30 drills coming in Phase 2'});});
export default router;
