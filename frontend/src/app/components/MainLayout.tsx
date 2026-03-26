import { Outlet, NavLink } from "react-router";
import { Home, ChefHat, Calendar, User, CookingPot } from "lucide-react";

export function MainLayout() {
  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden text-slate-800">
      <div className="flex-1 overflow-y-auto pb-16 scrollbar-hide">
        <Outlet />
      </div>
      
      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-2 flex justify-between items-center shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.1)] z-40 pb-safe">
        <NavItem to="/" icon={<Home size={22} />} label="首页" />
        <NavItem to="/recipes" icon={<ChefHat size={22} />} label="菜谱" />
        
        {/* Center Action Button */}
        <div className="relative -top-5 flex flex-col items-center justify-center">
          <button 
            type="button"
            onClick={() => alert('快速做菜开发中...')}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/40 transition-transform active:scale-95"
          >
            <CookingPot size={28} />
          </button>
        </div>

        <NavItem to="/plan" icon={<Calendar size={22} />} label="计划" />
        <NavItem to="/profile" icon={<User size={22} />} label="我的" />
      </div>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 w-12 transition-colors duration-200 ${
          isActive ? "text-orange-500" : "text-slate-400 hover:text-slate-600"
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
