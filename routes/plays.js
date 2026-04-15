import express from 'express';
const router=express.Router();
router.get('/',(req,res)=>{res.json({success:true,plays:[],note:'Full play library coming in Phase 2'});});
export default router;
