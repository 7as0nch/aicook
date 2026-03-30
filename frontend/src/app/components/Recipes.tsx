import { Link } from "react-router";
import { Plus, Search, Filter, FolderPlus, Link as LinkIcon, DownloadCloud } from "lucide-react";
import { RECIPES } from "../data";

export function Recipes() {
  return (
    <div className="flex flex-col h-full bg-slate-50 relative pb-6">
      <div className="bg-white px-5 pt-8 pb-4 sticky top-0 z-30 shadow-sm border-b border-slate-100">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">菜谱库</h1>
          <button className="bg-orange-500 text-white p-2 rounded-xl shadow-md hover:bg-orange-600 active:scale-95 transition-all">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide -mx-5 px-5">
          <button className="flex items-center gap-2 whitespace-nowrap bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium border border-blue-100">
            <FolderPlus className="w-4 h-4" /> 批量导入
          </button>
          <button className="flex items-center gap-2 whitespace-nowrap bg-purple-50 text-purple-700 px-4 py-2 rounded-full text-sm font-medium border border-purple-100">
            <LinkIcon className="w-4 h-4" /> URL 导入
          </button>
          <button className="flex items-center gap-2 whitespace-nowrap bg-orange-50 text-orange-700 px-4 py-2 rounded-full text-sm font-medium border border-orange-100">
            <DownloadCloud className="w-4 h-4" /> AI 搜索导入
          </button>
        </div>

        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-9 pr-4 py-2.5 bg-slate-100/80 border-transparent rounded-2xl text-sm placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-200 transition-all outline-none"
              placeholder="搜索我的菜谱..."
            />
          </div>
          <button className="bg-slate-100/80 p-2.5 rounded-2xl text-slate-600 active:bg-slate-200 transition-colors border border-transparent">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-5 mt-6 pb-20 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {RECIPES.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="flex flex-col bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-100 active:scale-[0.98]">
              <div className="relative aspect-square">
                <img src={recipe.coverImage} className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                  {recipe.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="bg-black/40 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded-full font-medium shadow-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-3 flex flex-col flex-1">
                <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 line-clamp-1">{recipe.title}</h3>
                <div className="mt-auto pt-2 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>{recipe.totalMinutes} 分钟</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{recipe.difficulty}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
