import React from 'react';
import {Outlet} from 'react-router-dom';
import TabletNav from './TabletNav';
import './AppShell.css';
function AppShell(){return <div className="app-shell"><main className="app-content"><Outlet/></main><TabletNav/></div>;}
export default AppShell;
