import React from "react";
import { Link, Outlet } from "react-router-dom";
import homeIcon from "../assets/imgs/home.svg";
import searchIcon from "../assets/imgs/search.svg";
import exploreIcon from "../assets/imgs/compass.svg";
import settingsIcon from "../assets/imgs/settings.svg";

export const SidebarLayout: React.FC = () => {
  return (
    <div className="layout-container">
      {/* 1. The Fixed Sidebar */}
      <nav className="sidebar">
        {/* Logo Area */}
        <Link to={"/"} className="logo-link">
          <img src={homeIcon} alt={"home"} />
        </Link>

        {/* Navigation Links */}
        <div className="nav-menu">
          <Link to={"/search"} className="sidebar-link">
            <img src={searchIcon} alt={"search"} />
          </Link>
          <Link to={"/explore"} className="sidebar-link">
            <img src={exploreIcon} alt={"explore"} />
          </Link>
        </div>

        {/* Bottom "More" or Settings area */}
        <div className="bottom-menu">
          <Link
            to="/admin/works"
            className="sidebar-link"
            title="Admin Dashboard"
          >
            <img src={settingsIcon} alt={"admin"} />
          </Link>
        </div>
      </nav>

      {/* 2. The Main Page Content */}
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
};
