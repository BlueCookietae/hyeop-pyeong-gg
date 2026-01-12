'use client';

export default function Footer() {
  
  const KAKAOPAY_LINK = "https://qr.kakaopay.com/Ej9QGnOnU"; 

  return (
    <footer className="py-10 px-6 bg-slate-950 border-t border-slate-800/50 mt-10">
      <div className="max-w-md mx-auto text-center space-y-8">
        
        {/* 1. 서버비 후원 버튼 (카카오페이) */}
        <div>
          <a 
            href={KAKAOPAY_LINK}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 bg-[#FEE500] hover:bg-[#FDD835] text-slate-900 px-6 py-4 rounded-2xl transition-all text-sm font-black shadow-[0_0_20px_rgba(254,229,0,0.2)] hover:shadow-[0_0_30px_rgba(254,229,0,0.4)] active:scale-95 group"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.122.49.178.483.376.351.155-.103 2.466-1.675 3.464-2.353.541.08 1.1.123 1.67.123 4.97 0 9-3.186 9-7.115C21 6.185 16.97 3 12 3z"/>
            </svg>
            <span>카카오페이로 서버비 보태주기</span>
          </a>
          <p className="mt-3 text-[10px] text-slate-600 font-medium">
            후원금액은 전액 서버 유지비로만 사용됩니다.
          </p>
        </div>

        {/* 2. 쿠팡 파트너스 */}
        <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 text-[10px] text-slate-500 leading-relaxed">
          <p className="mb-2 font-bold text-slate-400">🔥 롤붕이 필수템 추천</p>
          <a 
            href="https://link.coupang.com/..." // ⭐ 쿠팡 파트너스 링크
            target="_blank"
            rel="noreferrer" 
            className="block text-slate-400 hover:text-white underline decoration-slate-700 hover:decoration-white transition-colors text-xs"
          >
            "대상혁이 쓴다는 그 마우스, 최저가 확인하기"
          </a>
          <p className="mt-3 text-[9px] text-slate-700">
            이 포스팅은 쿠팡 파트너스 활동의 일환으로,<br/>이에 따른 일정액의 수수료를 제공받습니다.
          </p>
        </div>

        {/* 3. 하단 정보 & Contact */}
        <div className="border-t border-slate-800/50 pt-6">
          {/* 연락처 추가 */}
          <div className="mb-4">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Contact / Bug Report</span>
            <a 
              href="mailto:ggt3944@gmail.com" 
              className="block mt-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors font-medium"
            >
              ggt3944@gmail.com
            </a>
          </div>

          <div className="text-[9px] text-slate-700 font-medium">
            <p>Unofficial Fan Project. Not affiliated with LCK.</p>
            <p className="mt-1">© 2026 협곡평점.GG All rights reserved.</p>
          </div>
        </div>

      </div>
    </footer>
  );
}