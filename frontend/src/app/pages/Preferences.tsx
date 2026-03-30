import { useState } from "react";
import { ArrowLeft, Save, Plus } from "lucide-react";
import { useNavigate } from "react-router";

export default function Preferences() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState({
    spicy: "微辣",
    sweet: "正常",
    salt: "正常",
    allergies: ["花生", "芒果"],
    dietary: ["减脂", "高蛋白"],
  });

  const spicyLevels = ["不吃辣", "微辣", "中辣", "重辣"];
  const generalLevels = ["少", "正常", "多"];

  const handleSave = () => {
    // Mock save
    navigate(-1);
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-20">
      <div className="flex items-center justify-between p-4 bg-white sticky top-0 z-10 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">家庭偏好设置</h1>
        <button onClick={handleSave} className="p-2 -mr-2 text-orange-500">
          <Save className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        <div className="text-sm text-gray-500 bg-orange-50 p-3 rounded-xl border border-orange-100 leading-relaxed">
          💡 这里设置的偏好将自动同步到你的 <b>AI 知识库</b> 中，未来 AI 推荐菜谱或指导做菜时，会主动避开过敏源，并根据你的口味进行调整。
        </div>

        <div className="space-y-4">
          <h2 className="font-bold text-gray-900">基础口味</h2>
          
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">吃辣程度</label>
              <div className="flex gap-2">
                {spicyLevels.map(level => (
                  <button 
                    key={level}
                    onClick={() => setPreferences(p => ({...p, spicy: level}))}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                      preferences.spicy === level 
                        ? 'bg-orange-500 text-white shadow-sm' 
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          <h2 className="font-bold text-gray-900">忌口与过敏</h2>
          <div className="flex flex-wrap gap-2">
            {preferences.allergies.map(item => (
              <span key={item} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-sm font-medium flex items-center gap-1">
                {item}
                <button className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-red-100 text-red-400">×</button>
              </span>
            ))}
            <button className="px-3 py-1.5 bg-white border border-dashed border-gray-300 text-gray-500 rounded-full text-sm font-medium flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> 添加
            </button>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
          <h2 className="font-bold text-gray-900">饮食目标</h2>
          <div className="flex flex-wrap gap-2">
            {preferences.dietary.map(item => (
              <span key={item} className="px-3 py-1.5 bg-green-50 text-green-600 rounded-full text-sm font-medium flex items-center gap-1">
                {item}
                <button className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-green-100 text-green-400">×</button>
              </span>
            ))}
            <button className="px-3 py-1.5 bg-white border border-dashed border-gray-300 text-gray-500 rounded-full text-sm font-medium flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> 添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
