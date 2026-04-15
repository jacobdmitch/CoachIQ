import React from 'react';
import {BrowserRouter as Router,Routes,Route,Navigate} from 'react-router-dom';
import AppShell from './components/layout/AppShell';
function App(){return <Router><Routes><Route path="/" element={<AppShell/>><Route index element={<div>Dashboard</div>}/><Route path="roster" element={<div>Roster</div>}/><Route path="game/:id" element={<div>Game</div>}/></Route></Routes></Router>;}
export default App;
