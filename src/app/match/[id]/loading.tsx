export default function Loading() {
  return (
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans pb-20">
      {/* 1. 헤더 스켈레톤 */}
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 shadow-2xl transition-all max-w-md mx-auto">
        <div className="flex justify-between items-center px-4 py-3">
          <div className="w-6 h-6 bg-slate-800 rounded animate-pulse"></div> {/* 뒤로가기 버튼 */}
          <div className="w-24 h-6 bg-slate-800 rounded animate-pulse"></div> {/* 타이틀 */}
          <div className="w-6"></div> 
        </div>

        <div className="flex justify-between px-2 pb-2 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-1 h-8 bg-slate-800 rounded-lg animate-pulse"></div> 
          ))}
        </div>

        <div className="flex p-2 gap-3 bg-slate-900/50">
          <div className="flex-1 h-12 bg-slate-800 rounded-xl animate-pulse"></div> {/* 팀 선택 버튼 1 */}
          <div className="flex-1 h-12 bg-slate-800 rounded-xl animate-pulse"></div> {/* 팀 선택 버튼 2 */}
        </div>
      </div>

      {/* 2. 메인 카드 스켈레톤 */}
      <div className="max-w-md mx-auto p-4 space-y-6">
        <div className="p-6 rounded-[2rem] border border-slate-800 bg-slate-900 relative overflow-hidden shadow-2xl h-64">
           {/* 배경 텍스트 효과 */}
           <div className="absolute -right-4 -top-4 w-32 h-32 bg-slate-800 rounded-full opacity-10 animate-pulse"></div>
           
           <div className="relative z-10 flex flex-col justify-end h-full">
              <div className="flex justify-between items-end mb-4">
                  <div className="space-y-2">
                     <div className="w-20 h-3 bg-slate-800 rounded animate-pulse"></div>
                     <div className="w-32 h-8 bg-slate-800 rounded animate-pulse"></div>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                     <div className="w-16 h-3 bg-slate-800 rounded animate-pulse"></div>
                     <div className="w-16 h-8 bg-slate-800 rounded animate-pulse"></div>
                  </div>
              </div>
              <div className="h-px bg-white/10 my-4" />
              <div className="flex justify-between items-center">
                  <div className="w-20 h-4 bg-slate-800 rounded animate-pulse"></div>
                  <div className="w-16 h-6 bg-slate-800 rounded animate-pulse"></div>
              </div>
           </div>
        </div>

        {/* 3. 댓글 섹션 스켈레톤 */}
        <div className="space-y-4">
            <div className="flex items-center gap-2 pt-2">
                <div className="h-px bg-slate-800 flex-1"></div>
                <div className="w-20 h-3 bg-slate-800 rounded animate-pulse"></div>
                <div className="h-px bg-slate-800 flex-1"></div>
            </div>
            
            {/* 베스트 댓글 흉내 */}
            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-3">
                <div className="flex justify-between">
                    <div className="w-24 h-4 bg-slate-800 rounded animate-pulse"></div>
                    <div className="w-12 h-4 bg-slate-800 rounded animate-pulse"></div>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded animate-pulse"></div>
                <div className="w-2/3 h-3 bg-slate-800 rounded animate-pulse"></div>
            </div>

            {/* 입력창 흉내 */}
            <div className="border border-slate-800 bg-slate-900/50 p-4 rounded-2xl h-32 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}