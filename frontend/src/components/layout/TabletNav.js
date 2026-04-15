import React from 'react';
import {Link} from 'react-router-dom';
import './TabletNav.css';
function TabletNav(){return <nav className="tablet-nav"><Link to="/" className="nav-tab"><span className="nav-icon">📊</span><span className="nav-label">Dashboard</span></Link><Link to="/roster" className="nav-tab"><span className="nav-icon">👥</span><span className="nav-label">Roster</span></Link><Link to="/game" className="nav-tab"><span className="nav-icon">🎮</span><span className="nav-label">Game</span></Link><Link to="/settings" className="nav-tab"><span className="nav-icon">⚙️</span><span className="nav-label">Settings</span></Link></nav>;}
export default TabletNav;
