import { Outlet, NavLink } from "react-router";
import { Home, BookOpen, CalendarDays, User, CookingPot } from "lucide-react";
import clsx from "clsx";

export default function Layout() {
  const navItemsLeft = [
    { name: "首页", path: "/", icon: Home },
    { name: "菜谱", path: "/recipes", icon: BookOpen },
  ];
  const navItemsRight = [
    { name: "计划", path: "/plan", icon: CalendarDays },
    { name: "我的", path: "/profile", icon: User },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden text-gray-800 font-sans">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex justify-around items-center h-16 px-2 relative">
          {navItemsLeft.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                clsx(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                  isActive ? "text-orange-500" : "text-gray-400 hover:text-gray-600"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}

          {/* Center Action Button */}
          <div className="flex flex-col items-center justify-center w-full h-full">
            <button 
              type="button"
              onClick={() => alert('快速做菜开发中...')}
              className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/40 transition-transform active:scale-95"
            >
              <CookingPot size={28} />
            </button>
          </div>

          {navItemsRight.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                clsx(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                  isActive ? "text-orange-500" : "text-gray-400 hover:text-gray-600"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
