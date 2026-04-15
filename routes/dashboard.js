import express from 'express';
const router=express.Router();
router.get('/season/:teamId',(req,res)=>{res.json({success:true,dashboard:{teamId:req.params.teamId,gamesPlayed:0,totalPlayers:0}});});
export default router;
