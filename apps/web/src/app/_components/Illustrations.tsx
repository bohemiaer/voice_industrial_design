import Image from 'next/image';
import { MousePointer2, Hand, Minus, Plus, Undo2, Redo2, Upload, ArrowUp, Sparkles, Download, FolderDown } from 'lucide-react';
import exportReference from '../../../../../docs/langding/export.png';
import firstGenReference from '../../../../../docs/langding/first-gen.png';
import nodeReference from '../../../../../docs/langding/node.png';

export const OverviewIllustration = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F8FAFC] font-sans">
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#E2E8F0 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
      <div className="relative z-10 flex items-center justify-center h-full p-8">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-200 w-full max-w-[900px] h-[400px] flex flex-col">
          <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <span className="text-[11px] text-slate-400 font-medium">概念树工作台</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded-full font-medium flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                新建会话
              </div>
            </div>
          </div>
          <div className="flex-1 relative flex items-center justify-center">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#E2E8F0 0.8px, transparent 0.8px)', backgroundSize: '20px 20px' }} />
            <div className="relative z-10">
              <div className="w-36 h-36 rounded-full bg-slate-900 flex items-center justify-center shadow-lg">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-400 border-2 border-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RootInputIllustration = () => {
  return (
    <div className="w-full h-full bg-[#F8FAFC] relative flex items-center justify-center p-4 md:p-8 gap-4 md:gap-8 overflow-hidden font-sans">
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#E2E8F0 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
      <div className="bg-white rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 p-6 w-[280px] shrink-0 relative z-10">
         <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Root</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
         </div>
         <h3 className="text-lg font-bold text-slate-900 mb-4">请输入您想要设计的产品</h3>
         <div className="bg-[#F8FAFC] p-4 border border-slate-50 rounded-xl">
           <p className="text-xs text-slate-500 mb-4">请详细描述你的需求，可以参考下面几个要点</p>
           <div className="flex flex-wrap gap-2">
             {["描述产品类型", "说明核心功能", "定义目标人群", "列出关键需求"].map(tag => (
               <div key={tag} className="px-3 py-1.5 border border-slate-200 text-[10px] text-slate-600 bg-white rounded-md">
                 {tag}
               </div>
             ))}
           </div>
         </div>
      </div>

      <div className="flex-1 min-w-[240px] max-w-[320px] flex flex-col gap-4 relative z-10 h-[280px]">
         <div className="mt-auto bg-white border border-slate-200 shadow-sm rounded-[24px] p-5 h-[140px] flex flex-col justify-between">
            <div className="text-[13px] text-slate-400">描述您的下一步需求</div>
            <div className="flex items-center justify-between">
              <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-50 text-slate-900">
                <Plus className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <button className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                </button>
                <button className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white hover:bg-slate-800 shadow-md">
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export const FirstGenIllustration = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F8FAFC]">
      <Image
        src={firstGenReference}
        alt="第一组方向参考图"
        fill
        className="object-contain"
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={false}
      />
    </div>
  );
};

export const NodeBubbleIllustration = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F8FAFC]">
      <Image
        src={nodeReference}
        alt="节点展开参考图"
        fill
        className="object-contain"
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={false}
      />
    </div>
  );
};

export const ToolbarIllustration = () => {
  return (
    <div className="w-full h-full bg-[#F8FAFC] relative flex items-center justify-center font-sans">
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#E2E8F0 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
      
      <div className="bg-white shadow-sm border border-slate-200 rounded-full p-2 md:p-3 flex flex-col items-center gap-2 md:gap-3 w-14 md:w-[60px]">
         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-700 transition-colors">
           <MousePointer2 className="w-5 h-5 fill-slate-900 stroke-slate-900" />
         </button>
         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-slate-100 text-slate-900">
           <Hand className="w-5 h-5" />
         </button>
         
         <div className="w-8 h-px bg-slate-200 my-1"></div>
         
         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-700 transition-colors">
           <Minus className="w-5 h-5" />
         </button>
         <span className="text-[10px] md:text-[11px] font-bold text-slate-700">100%</span>
         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-700 transition-colors">
           <Plus className="w-5 h-5" />
         </button>
         
         <div className="w-8 h-px bg-slate-200 my-1"></div>
         
         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-700 transition-colors">
           <Undo2 className="w-5 h-5" />
         </button>
         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-700 transition-colors">
           <Redo2 className="w-5 h-5" />
         </button>

         <div className="w-8 h-px bg-slate-200 my-1"></div>

         <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-700 transition-colors">
           <Upload className="w-5 h-5" />
         </button>
      </div>
    </div>
  );
};

export const ExportIllustration = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <Image
        src={exportReference}
        alt="导出概念树参考图"
        fill
        className="object-contain"
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={false}
      />
    </div>
  );
};
