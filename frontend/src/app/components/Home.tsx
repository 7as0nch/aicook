import { Link } from "react-router";
import { Search, ChevronRight, Clock, Flame, CheckCircle2 } from "lucide-react";
import { RECIPES, CATEGORIES } from "../data";

export function Home() {
  return (
    <div className="flex flex-col h-full bg-slate-50 relative pb-6">
      {/* Header / Search */}
      <div className="bg-white px-5 pt-8 pb-4 sticky top-0 z-30 shadow-sm">
        <h1 className="text-xl font-bold mb-4 text-slate-800 tracking-tight">早上好，今天想吃点什么？</h1>
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-4 py-3 bg-slate-100/80 border-transparent rounded-2xl text-sm placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-200 transition-all outline-none"
            placeholder="搜索菜名、食材、口味或场景"
          />
        </div>
      </div>

      <div className="px-5 mt-4 space-y-8 pb-20 overflow-y-auto">
        {/* Categories */}
        <div>
          <div className="grid grid-cols-3 gap-3">
            {CATEGORIES.map((cat, i) => (
              <div key={i} className="flex flex-col items-center justify-center bg-white p-3 rounded-2xl shadow-sm hover:shadow-md transition-shadow active:scale-95 cursor-pointer">
                <span className="text-2xl mb-1">{cat.icon}</span>
                <span className="text-xs font-medium text-slate-600">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations - Today */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="bg-orange-100 text-orange-600 p-1 rounded-md">✨</span>
              为您推荐
            </h2>
            <button className="text-sm text-slate-500 flex items-center">
              查看全部 <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex overflow-x-auto gap-4 pb-4 -mx-5 px-5 snap-x scrollbar-hide">
            {RECIPES.map((recipe) => (
              <Link 
                key={recipe.id} 
                to={`/recipes/${recipe.id}`}
                className="min-w-[260px] bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow snap-center flex-shrink-0 border border-slate-100"
              >
                <div className="relative h-40">
                  <img src={recipe.coverImage} alt={recipe.title} className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    {recipe.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="bg-white/90 backdrop-blur-sm text-xs font-semibold px-2.5 py-1 rounded-full text-slate-700 shadow-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{recipe.title}</h3>
                  <p className="text-slate-500 text-xs mb-3 line-clamp-1">{recipe.subtitle}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{recipe.totalMinutes} 分钟</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      <span>{recipe.difficulty}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      食材齐 80%
                    </div>
                    <button className="bg-orange-500 text-white p-2 rounded-xl active:bg-orange-600 transition-colors shadow-sm">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 15 Minute Quick Meals */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">15分钟快手菜</h2>
          </div>
          <div className="space-y-3">
            {RECIPES.filter(r => r.totalMinutes <= 15).map(recipe => (
              <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="flex gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-50 active:scale-[0.98] transition-transform">
                <img src={recipe.coverImage} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0 py-1">
                  <h3 className="font-bold text-slate-800 mb-1 truncate">{recipe.title}</h3>
                  <p className="text-slate-500 text-xs line-clamp-1 mb-2">{recipe.summary}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{recipe.totalMinutes} 分钟</span>
                    <span>{recipe.difficulty}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
