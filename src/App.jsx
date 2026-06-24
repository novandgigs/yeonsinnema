import React, { useState, useEffect } from 'react';
import { MessageSquare, CalendarDays, Users, LogOut, Star, CheckCircle2, UserPlus, LogIn, Quote, Clapperboard } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

// --- 관리자 설정 (영화 정보 및 포스터 변경) ---
// 사장님, 아래 정보의 따옴표 안의 내용을 변경하시면 페이지에 바로 반영됩니다!
// 포스터 이미지는 온라인에 등록된 이미지 주소(http...)를 복사해서 붙여넣으시면 됩니다.
const MOVIE_DATA = {
  current: {
    titleKo: "화양연화",
    titleEn: "In the Mood for Love",
    year: "2000",
    director: "왕가위",
    actors: "양조위, 장만옥",
    quote: "가장 아름답고 찬란했던 시절, 그들의 비밀스러운 로맨스",
    date: "2026년 6월 29일 (월) 오후 7:30",
    location: "연신내 아지트",
    posterUrl: "https://images.unsplash.com/photo-1543584756-8f40a802e14f?auto=format&fit=crop&q=80&w=800" // 현재 상영작 포스터 링크
  },
  next: {
    titleKo: "그 시절, 우리가 사랑했던 소녀",
    titleEn: "You Are the Apple of My Eye",
    year: "2011",
    director: "구파도",
    actors: "가진동, 천옌시",
    posterUrl: "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?auto=format&fit=crop&q=80&w=800" // 다음 상영작 포스터 링크
  }
};

// --- Firebase 초기화 ---
const const firebaseConfig = {
  apiKey: "AIzaSyDGKJb-gJEmycHUkywHXkLjQKS2S7EMhrI",
  authDomain: "yeonsinnema.firebaseapp.com",
  projectId: "yeonsinnema",
  storageBucket: "yeonsinnema.firebasestorage.app",
  messagingSenderId: "319341297163",
  appId: "1:319341297163:web:352e2ce03b19b643e0d10e"
};
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'yeonsinnema-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null); // { nickname, phone }
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // 데이터 상태
  const [comments, setComments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  
  // 입력 폼 상태
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [phoneInput, setPhoneInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [newComment, setNewComment] = useState('');
  const [rating, setRating] = useState(5);
  const [authError, setAuthError] = useState('');

  // 1. Firebase Auth 및 자동 로그인 설정
  useEffect(() => {
    if (!auth) return;
    
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && db) {
        // 로컬 스토리지에서 전화번호(4자리)를 확인하여 자동 로그인
        const savedPhone = localStorage.getItem('yeonsinnema_phone');
        if (savedPhone) {
          try {
            const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profiles', savedPhone);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              setAppUser(profileSnap.data());
            } else {
              localStorage.removeItem('yeonsinnema_phone');
            }
          } catch (e) {
            console.error("Auto login error:", e);
          }
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 실시간 데이터 불러오기 (Firestore)
  useEffect(() => {
    if (!user || !db || !appUser) return;

    // 감상평 불러오기
    const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'comments');
    const unsubComments = onSnapshot(commentsRef, (snapshot) => {
      const loadedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedComments.sort((a, b) => b.timestamp - a.timestamp); // 최신순 정렬
      setComments(loadedComments);
    }, (error) => console.error("Comments error:", error));

    // 출석부 불러오기
    const attendanceRef = collection(db, 'artifacts', appId, 'public', 'data', 'attendance');
    const unsubAttendance = onSnapshot(attendanceRef, (snapshot) => {
      const loadedAttendance = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedAttendance.sort((a, b) => b.timestamp - a.timestamp);
      setAttendance(loadedAttendance);
    }, (error) => console.error("Attendance error:", error));

    return () => {
      unsubComments();
      unsubAttendance();
    };
  }, [user, appUser]);

  // --- 인증 관련 함수 ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!user || !db) return;
    if (phoneInput.length !== 4) {
      setAuthError('전화번호 뒷 4자리를 정확히 입력해주세요.');
      return;
    }

    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phoneInput);

    try {
      if (authMode === 'login') {
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userData = profileSnap.data();
          setAppUser(userData);
          localStorage.setItem('yeonsinnema_phone', phoneInput);
        } else {
          setAuthError('등록되지 않은 번호입니다. 신규 가입을 진행해주세요.');
        }
      } else {
        if (!nicknameInput.trim()) {
          setAuthError('닉네임을 입력해주세요.');
          return;
        }
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setAuthError('이미 가입된 번호입니다. 로그인해주세요.');
          return;
        }
        
        const userInfo = { nickname: nicknameInput, phone: phoneInput, uid: user.uid, createdAt: Date.now() };
        await setDoc(profileRef, userInfo);
        setAppUser(userInfo);
        localStorage.setItem('yeonsinnema_phone', phoneInput);
      }
    } catch (error) {
      console.error("Auth process error:", error);
      setAuthError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleLogout = () => {
    setAppUser(null);
    setPhoneInput('');
    setNicknameInput('');
    localStorage.removeItem('yeonsinnema_phone');
  };

  // --- 기능 관련 함수 ---
  const submitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !user || !db) return;
    try {
      const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'comments');
      await addDoc(commentsRef, {
        nickname: appUser.nickname,
        phone: appUser.phone,
        text: newComment,
        rating: rating,
        timestamp: Date.now()
      });
      setNewComment('');
      setRating(5);
    } catch (error) {
      console.error("Comment submit error:", error);
    }
  };

  const deleteComment = async (commentId) => {
    if (!user || !db) return;
    if (window.confirm('감상평을 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comments', commentId));
      } catch (error) {
        console.error("Delete comment error:", error);
      }
    }
  };

  const toggleAttendance = async (status) => {
    if (!user || !db || !appUser) return;
    try {
      const attendanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'attendance', appUser.phone);
      await setDoc(attendanceRef, {
        nickname: appUser.nickname,
        phone: appUser.phone,
        status: status, // 'going' or 'not_going'
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Attendance error:", error);
    }
  };

  const myAttendance = attendance.find(a => a.phone === appUser?.phone);
  const isGoing = myAttendance?.status === 'going';

  // --- 화면 렌더링 ---

  if (isAuthLoading) {
    return <div className="min-h-screen bg-[#011214] flex items-center justify-center text-[#d4af37] tracking-widest font-bold">로딩 중...</div>;
  }

  // 로그인/회원가입 화면
  if (!appUser) {
    return (
      <div className="min-h-screen bg-[#011214] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-gradient-to-b from-[#032328] to-[#011214] p-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-[#d4af37] border-opacity-30 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent opacity-70"></div>
          
          <div className="flex justify-center mb-6 relative z-10">
            <div className="p-4 bg-[#011214] rounded-full border border-[#d4af37] border-opacity-40 shadow-[0_0_30px_rgba(212,175,55,0.25)]">
              <Clapperboard className="w-12 h-12 text-[#d4af37]" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-b from-[#fbf5b7] via-[#d4af37] to-[#aa801e] mb-2 tracking-widest font-serif drop-shadow-md">
            연신네마
          </h1>
          <p className="text-center text-gray-400 mb-8 text-sm tracking-wide opacity-90">
            프라이빗 시네마 클럽에 오신 것을 환영합니다.
          </p>

          <div className="flex bg-[#011214] rounded-xl p-1 mb-6 border border-[#144950] border-opacity-70 shadow-inner">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                authMode === 'login' ? 'bg-gradient-to-r from-[#e5c158] to-[#d4af37] text-[#011214] shadow-md' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LogIn className="w-4 h-4" /> 입장하기
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                authMode === 'register' ? 'bg-gradient-to-r from-[#e5c158] to-[#d4af37] text-[#011214] shadow-md' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <UserPlus className="w-4 h-4" /> 신규 가입
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-5 relative z-10">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37] mb-1.5 uppercase tracking-wider">닉네임</label>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="모임에서 사용할 이름"
                  className="w-full px-4 py-3.5 rounded-xl bg-[#021a1d] text-gray-100 border border-[#144950] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] transition-colors placeholder-gray-600 shadow-inner"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37] mb-1.5 uppercase tracking-wider">전화번호 (뒷 4자리)</label>
              <input
                type="tel"
                value={phoneInput}
                maxLength={4}
                onChange={(e) => setPhoneInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder=""
                className="w-full px-4 py-3.5 rounded-xl bg-[#021a1d] text-gray-100 border border-[#144950] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] transition-colors shadow-inner text-center text-xl tracking-[0.5em] font-mono"
              />
            </div>
            
            {authError && <p className="text-red-400 text-xs text-center font-medium bg-red-900 bg-opacity-20 py-2 rounded-lg border border-red-800 border-opacity-30">{authError}</p>}
            
            <button
              type="submit"
              className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-[#f4d473] via-[#d4af37] to-[#aa801e] text-[#011214] hover:from-[#fbf5b7] hover:via-[#e5c158] hover:to-[#d4af37] transition-all shadow-[0_5px_20px_rgba(212,175,55,0.3)] mt-3 flex justify-center items-center gap-2"
            >
              {authMode === 'login' ? '라운지 입장' : '회원가입 완료'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 메인 원페이지 앱 ---
  return (
    <div className="min-h-screen bg-[#011214] text-gray-200 font-sans selection:bg-[#d4af37] selection:text-[#011214]">
      
      {/* 고정 헤더 */}
      <header className="fixed top-0 w-full bg-[#011214] bg-opacity-80 backdrop-blur-lg z-50 border-b border-[#d4af37] border-opacity-10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-xl mx-auto px-5 py-4 flex justify-between items-center">
          <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] via-[#d4af37] to-[#aa801e] flex items-center gap-2 tracking-widest font-serif drop-shadow-sm">
            <Clapperboard className="w-5 h-5 text-[#d4af37]" /> 연신네마
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[#021e22] px-3 py-1.5 rounded-full border border-[#144950] shadow-inner">
              <div className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse shadow-[0_0_8px_#d4af37]"></div>
              <span className="text-xs font-medium text-gray-300"><strong className="text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37]">{appUser.nickname}</strong> 님</span>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-[#d4af37] transition-colors p-1" title="로그아웃">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto pt-24 pb-16 px-4 space-y-12">
        
        {/* Section 1: 이번 주 영화 안내 */}
        <section id="current-movie" className="animate-in slide-in-from-bottom-8 duration-700 fade-in">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-8 h-px bg-gradient-to-r from-[#d4af37] to-transparent opacity-70"></span>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] via-[#d4af37] to-[#aa801e] uppercase tracking-widest flex items-center gap-2 drop-shadow-md">
               이번 주 상영작
            </h2>
          </div>

          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] rounded-3xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-[#d4af37] border-opacity-20 relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>
            {/* 포스터 영역 */}
            <div className="relative aspect-[4/5] sm:aspect-video w-full bg-black group overflow-hidden">
              <img 
                src={MOVIE_DATA.current.posterUrl} 
                alt="이번주 영화 포스터" 
                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#011619] via-transparent to-transparent"></div>
              
              {/* 포스터 위 오버레이 텍스트 */}
              <div className="absolute bottom-0 left-0 p-6 w-full">
                <div className="inline-block px-3 py-1 rounded-full bg-[#011214] bg-opacity-80 border border-[#d4af37] text-[#fbf5b7] text-xs font-bold mb-3 backdrop-blur-md shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                  VOL. 1
                </div>
                <h3 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-300 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] mb-1">{MOVIE_DATA.current.titleKo}</h3>
                <p className="text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-[#aa801e] font-medium text-lg drop-shadow-md">{MOVIE_DATA.current.titleEn}, {MOVIE_DATA.current.year}</p>
              </div>
            </div>

            {/* 영화 상세 정보 */}
            <div className="p-6 md:p-8 space-y-6 relative z-10">
              {/* 한줄평 */}
              <div className="bg-[#011214] bg-opacity-60 p-5 rounded-2xl border-l-4 border-[#d4af37] relative shadow-inner">
                <Quote className="absolute top-4 right-4 w-8 h-8 text-[#d4af37] opacity-10" />
                <p className="text-gray-200 text-sm md:text-base leading-relaxed italic relative z-10 font-serif">
                  "{MOVIE_DATA.current.quote}"
                </p>
                <p className="text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-[#aa801e] text-xs mt-3 font-bold text-right">- 에디터 한줄평</p>
              </div>

              {/* 감독/주연 정보 */}
              <div className="grid grid-cols-2 gap-4 border-t border-b border-[#144950] py-5">
                <div>
                  <p className="text-[10px] text-[#aa801e] mb-1 uppercase tracking-widest font-bold">Director</p>
                  <p className="text-sm font-medium text-gray-200">{MOVIE_DATA.current.director}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#aa801e] mb-1 uppercase tracking-widest font-bold">Cast</p>
                  <p className="text-sm font-medium text-gray-200">{MOVIE_DATA.current.actors}</p>
                </div>
              </div>

              {/* 일시 및 장소 */}
              <div className="space-y-3 bg-[#021e22] p-5 rounded-2xl border border-[#144950] shadow-md">
                <div className="flex items-center gap-4 text-sm">
                  <div className="p-2 bg-[#011214] rounded-lg shadow-inner"><CalendarDays className="w-5 h-5 text-[#d4af37]" /></div>
                  <span className="text-gray-200">{MOVIE_DATA.current.date}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="p-2 bg-[#011214] rounded-lg shadow-inner"><Users className="w-5 h-5 text-[#d4af37]" /></div>
                  <span className="text-gray-200">{MOVIE_DATA.current.location}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: 출석부 */}
        <section id="attendance" className="scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-8 h-px bg-gradient-to-r from-[#d4af37] to-transparent opacity-70"></span>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] via-[#d4af37] to-[#aa801e] uppercase tracking-widest flex items-center gap-2 drop-shadow-md">
               참석 여부
            </h2>
          </div>

          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 md:p-8 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-[#d4af37] border-opacity-30 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#d4af37] opacity-5 blur-3xl rounded-full pointer-events-none"></div>
            
            <div className="text-center mb-8 relative z-10">
              <p className="text-gray-200 text-lg mb-2">
                이번 주 <strong className="text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37] font-extrabold text-xl px-1 drop-shadow-md">[{MOVIE_DATA.current.titleKo}]</strong> 상영회
              </p>
              <p className="text-gray-400 text-sm">함께 하실 수 있나요?</p>
            </div>

            <div className="flex gap-4 relative z-10">
              <button
                onClick={() => toggleAttendance('going')}
                className={`flex-1 py-4 md:py-5 rounded-2xl font-bold text-lg transition-all duration-300 flex flex-col items-center gap-2 ${
                  isGoing 
                  ? 'bg-gradient-to-br from-[#f4d473] via-[#d4af37] to-[#aa801e] text-[#011214] shadow-[0_0_25px_rgba(212,175,55,0.5)] scale-105 ring-1 ring-[#fbf5b7]' 
                  : 'bg-[#011214] text-gray-300 border border-[#144950] hover:border-[#d4af37] hover:shadow-[0_0_15px_rgba(212,175,55,0.2)]'
                }`}
              >
                <CheckCircle2 className={`w-6 h-6 ${isGoing ? 'text-[#011214]' : 'text-[#d4af37] opacity-50'}`} />
                참석할게요
              </button>
              <button
                onClick={() => toggleAttendance('not_going')}
                className={`flex-1 py-4 md:py-5 rounded-2xl font-bold text-lg transition-all duration-300 flex flex-col items-center gap-2 ${
                  !isGoing && myAttendance
                  ? 'bg-[#010a0b] text-gray-600 border border-transparent shadow-inner scale-95' 
                  : 'bg-[#011214] text-gray-400 border border-[#144950] hover:border-gray-500'
                }`}
              >
                <span className={`text-xl ${!isGoing && myAttendance ? 'opacity-30' : 'opacity-70'}`}>💨</span>
                못 가요
              </button>
            </div>

            {/* 참석자 명단 */}
            <div className="mt-10 pt-6 border-t border-[#144950] relative z-10">
              <div className="flex justify-between items-end mb-4">
                <h3 className="text-[11px] font-bold text-[#d4af37] uppercase tracking-widest opacity-80">Attend List</h3>
                <span className="text-xs bg-[#011214] px-3 py-1.5 rounded-full text-gray-300 border border-[#144950] shadow-inner">
                  총 <strong className="text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37] font-bold text-sm">{attendance.filter(a => a.status === 'going').length}</strong>명 참석
                </span>
              </div>
              
              <div className="flex flex-wrap gap-2.5">
                {attendance.filter(a => a.status === 'going').map((attendee) => (
                  <div key={attendee.id} className="bg-[#011214] border border-[#d4af37] border-opacity-40 pl-1 pr-4 py-1.5 rounded-full flex items-center gap-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-300">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#fbf5b7] via-[#d4af37] to-[#9c7e1c] flex items-center justify-center flex-shrink-0 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.3)]">
                      <span className="text-[#011214] font-black text-xs">{attendee.nickname.substring(0,1)}</span>
                    </div>
                    <span className="text-gray-100 font-medium text-sm tracking-wide">{attendee.nickname}</span>
                  </div>
                ))}
                {attendance.filter(a => a.status === 'going').length === 0 && (
                  <p className="w-full text-center py-6 text-sm text-gray-500 italic bg-[#011214] rounded-2xl border border-dashed border-[#144950]">
                    아직 참석자가 없습니다. 첫 번째 VIP가 되어주세요!
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: 감상평 */}
        <section id="reviews" className="scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
             <span className="w-8 h-px bg-gradient-to-r from-[#d4af37] to-transparent opacity-70"></span>
             <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] via-[#d4af37] to-[#aa801e] uppercase tracking-widest flex items-center gap-2 drop-shadow-md">
               감상평
             </h2>
          </div>
          
          <div className="space-y-6">
            {/* 입력 폼 */}
            <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 md:p-8 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-[#144950]">
              <form onSubmit={submitComment}>
                <div className="flex justify-between items-center mb-5">
                  <span className="text-sm font-bold text-[#d4af37] uppercase tracking-wider text-[11px]">Rate & Review</span>
                  <div className="flex gap-1.5 bg-[#011214] p-1.5 rounded-full border border-[#144950] shadow-inner">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRating(star)}
                        className="focus:outline-none transition-transform hover:scale-125"
                      >
                        <Star className={`w-7 h-7 ${rating >= star ? 'fill-[#d4af37] text-[#d4af37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]' : 'text-[#144950]'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="이 영화에 대한 프라이빗한 감상을 남겨주세요."
                  className="w-full px-5 py-4 rounded-2xl bg-[#011214] text-gray-100 border border-[#144950] focus:outline-none focus:border-[#d4af37] resize-none h-28 mb-4 text-sm leading-relaxed placeholder-gray-600 shadow-inner"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!newComment.trim()}
                    className="px-8 py-3.5 rounded-xl font-bold bg-gradient-to-r from-[#f4d473] via-[#d4af37] to-[#aa801e] text-[#011214] hover:from-[#fbf5b7] hover:via-[#e5c158] hover:to-[#d4af37] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_5px_15px_rgba(212,175,55,0.3)] flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" /> 등록하기
                  </button>
                </div>
              </form>
            </div>

            {/* 댓글 리스트 */}
            <div className="space-y-4">
              {comments.length === 0 ? (
                <div className="bg-[#011214] border border-dashed border-[#144950] rounded-3xl py-12 text-center">
                  <MessageSquare className="w-8 h-8 text-[#144950] mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">등록된 감상평이 없습니다.<br/>첫 번째 리뷰어가 되어주세요!</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-gradient-to-br from-[#03252a] to-[#011619] p-5 md:p-6 rounded-2xl border border-[#144950] shadow-lg relative group transition-all hover:border-[#d4af37] hover:border-opacity-60">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#011214] border border-[#d4af37] border-opacity-70 flex items-center justify-center shadow-inner">
                           <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#fbf5b7] to-[#d4af37] font-black text-sm">{comment.nickname.substring(0,1)}</span>
                        </div>
                        <span className="font-bold text-gray-100 tracking-wide">{comment.nickname}</span>
                      </div>
                      <div className="flex gap-0.5 bg-[#011214] px-2.5 py-1.5 rounded-full border border-[#144950] shadow-inner">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} className={`w-3.5 h-3.5 ${comment.rating >= star ? 'fill-[#d4af37] text-[#d4af37]' : 'text-[#144950]'}`} />
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-300 text-sm md:text-base leading-relaxed whitespace-pre-wrap pl-12">{comment.text}</p>
                    <div className="flex justify-between items-center mt-5 pl-12">
                      <span className="text-[11px] text-[#d4af37] opacity-60 font-mono tracking-wider">
                        {new Date(comment.timestamp).toLocaleString('ko-KR', { year:'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' })}
                      </span>
                      {comment.phone === appUser.phone && (
                        <button 
                          onClick={() => deleteComment(comment.id)} 
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1 bg-[#011214] border border-[#144950] rounded-lg opacity-0 group-hover:opacity-100 shadow-sm"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Section 4: 다음 영화 예고 */}
        <section id="next-movie" className="scroll-mt-24 pb-12">
           <div className="flex items-center gap-3 mb-6">
             <span className="w-8 h-px bg-gradient-to-r from-[#d4af37] to-transparent opacity-40"></span>
             <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-300 to-gray-500 uppercase tracking-widest flex items-center gap-2">
               다음 주 예고
             </h2>
          </div>
          <div className="bg-[#011214] rounded-3xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.8)] border border-[#144950] opacity-90 hover:opacity-100 transition-opacity">
             <div className="flex flex-col sm:flex-row">
                {/* 포스터 미니 영역 */}
                <div className="w-full sm:w-1/3 aspect-video sm:aspect-auto bg-black relative overflow-hidden">
                   <img 
                      src={MOVIE_DATA.next.posterUrl} 
                      alt="다음주 영화 포스터" 
                      className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 hover:scale-110 transition-all duration-1000"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#011214] to-transparent sm:bg-gradient-to-r"></div>
                </div>
                
                {/* 텍스트 영역 */}
                <div className="w-full sm:w-2/3 p-6 md:p-8 flex flex-col justify-center relative z-10 bg-gradient-to-l from-[#021a1d] to-transparent">
                   <p className="text-[10px] font-bold text-[#d4af37] mb-2 tracking-widest uppercase opacity-80">Next Week</p>
                   <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-1 drop-shadow-md">{MOVIE_DATA.next.titleKo}</h3>
                   <p className="text-[#d4af37] opacity-80 text-sm mb-5 font-medium">{MOVIE_DATA.next.titleEn}, {MOVIE_DATA.next.year}</p>
                   
                   <div className="space-y-2 mt-auto">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Director</p>
                      <p className="text-sm font-medium text-gray-300 mb-3">{MOVIE_DATA.next.director}</p>
                      
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Cast</p>
                      <p className="text-sm font-medium text-gray-300">{MOVIE_DATA.next.actors}</p>
                   </div>
                </div>
             </div>
          </div>
        </section>

      </main>
      
      {/* 푸터 */}
      <footer className="border-t border-[#144950] py-10 text-center bg-[#010a0b]">
        <Clapperboard className="w-6 h-6 text-[#144950] mx-auto mb-4" />
        <p className="text-xs text-[#d4af37] opacity-40 uppercase tracking-widest font-mono">Yeonsinnema Private Club</p>
        <p className="text-[10px] text-gray-600 mt-2">© 2026 Board Game Cafe. All rights reserved.</p>
      </footer>

    </div>
  );
}