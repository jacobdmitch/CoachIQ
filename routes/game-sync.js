import logger from '../services/logger.js';
export default function setupGameSync(io){const gameNamespace=io.of('/game');gameNamespace.on('connection',(socket)=>{logger.debug(`Socket connected: ${socket.id}`);socket.on('join_session',(data)=>{socket.join(data.joinCode);socket.emit('session_joined',{success:true,joinCode:data.joinCode});});});}
