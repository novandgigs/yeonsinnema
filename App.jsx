import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, CalendarDays, Users, LogOut, Star, CheckCircle2, UserPlus, LogIn, Quote, Clapperboard, Settings, Lock, X, Trash2, MessageCircle, Send, Bell, BellOff } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

// --- 차단할 전화번호 목록 (블랙리스트) ---
const BLOCKED_NUMBERS = ["9999", "0000", "1234"]; 

// --- 관리자 설정 (영화 정보 및 포스터 변경) ---
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
    posterUrl: "https://media.themoviedb.org/t/p/w220_and_h330_face/yCKaf65zoySg2iJdsews4Rafl7C.jpg"
  },
  next: {
    titleKo: "그 시절, 우리가 사랑했던 소녀",
    titleEn: "You Are the Apple of My Eye",
    year: "2011",
    director: "구파도",
    actors: "가진동, 천옌시",
    quote: "그 시절, 우리가 사랑했던 소녀",
    date: "2026년 7월 6일 (수) 오후 7:30",
    location: "연신내 아지트",
    posterUrl: "https://media.themoviedb.org/t/p/w300_and_h450_face/ynLYtNB3AOiDX4Ltr1uMea8oNHM.jpg"
  }
};

// --- Firebase 초기화 ---
const myFirebaseConfig = {
  apiKey: "AIzaSyDGKJb-gJEmycHUkywHXkLjQKS2S7EMhrI",
  authDomain: "yeonsinnema.firebaseapp.com",
  projectId: "yeonsinnema",
  storageBucket: "yeonsinnema.firebasestorage.app",
  messagingSenderId: "319341297163",
  appId: "1:319341297163:web:352e2ce03b19b643e0d10e"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config 
  ? JSON.parse(__firebase_config) 
  : myFirebaseConfig;

const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'yeonsinnema-app';

// --- 티어(등급) 계산 도우미 함수 ---
const getTierInfo = (count) => {
  if (count >= 51) return { name: '다이아몬드', style: 'bg-gradient-to-r from-cyan-900 to-blue-900 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)] font-black' };
  if (count >= 21) return { name: '블랙티켓', style: 'bg-black text-white border-gray-600 shadow-[0_1px_5px_rgba(255,255,255,0.2)] font-bold' };
  if (count >= 11) return { name: '골드티켓', style: 'bg-yellow-900/40 text-[#d4af37] border-[#d4af37] shadow-[0_0_8px_rgba(212,175,55,0.4)] font-bold' };
  if (count >= 6) return { name: '실버티켓', style: 'bg-gray-800 text-gray-300 border-gray-500 font-semibold' };
  if (count >= 2) return { name: '블루티켓', style: 'bg-blue-900/40 text-blue-400 border-blue-700/50' };
  return { name: '그린티켓', style: 'bg-green-900/40 text-green-400 border-green-700/50' };
};

const TierBadge = ({ count }) => {
  const tier = getTierInfo(count || 0);
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tier.style} whitespace-nowrap tracking-wider`}>
      {tier.name}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null); 
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [comments, setComments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [profiles, setProfiles] = useState([]); 
  
  // 실시간 채팅 & 알림 상태
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false); 
  
  const messagesEndRef = useRef(null);
  const prevChatLengthRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  
  // [수정됨] 구글에서 제공하는 절대 끊기지 않는 팝 사운드로 교체
  const notificationSound = useRef(typeof Audio !== "undefined" ? new Audio('https://actions.google.com/sounds/v1/ui/pop.ogg') : null);
  
  const [authMode, setAuthMode] = useState('login'); 
  const [phoneInput, setPhoneInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [newComment, setNewComment] = useState('');
  const [rating, setRating] = useState(5);
  const [authError, setAuthError] = useState('');

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const ADMIN_PIN = "1423"; 

  // [수정됨] 브라우저/스마트폰의 자동재생 차단을 뚫기 위한 코드
  useEffect(() => {
    const enableAudio = () => {
      if (notificationSound.current) {
        notificationSound.current.load(); // 사용자가 화면을 터치할 때 미리 오디오를 메모리에 로드
      }
      document.removeEventListener('click', enableAudio);
      document.removeEventListener('touchstart', enableAudio);
    };
    // 화면을 클릭하거나 터치하는 순간 오디오 차단이 풀립니다.
    document.addEventListener('click', enableAudio);
    document.addEventListener('touchstart', enableAudio);
    
    return () => {
      document.removeEventListener('click', enableAudio);
      document.removeEventListener('touchstart', enableAudio);
    };
  }, []);

  // 1. Firebase Auth 및 자동 로그인 설정
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token && firebaseConfig !== myFirebaseConfig) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.log(e); }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && db) {
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
          } catch (e) { console.log(e); }
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1-2. 현재 로그인된 회원의 정보 실시간 감시 (강제삭제 대비)
  useEffect(() => {
    if (!db || !appUser?.phone) return;
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'profiles', appUser.phone);
    const unsub = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setAppUser(prev => ({ ...prev, ...docSnap.data() }));
      } else {
        setAppUser(null);
        localStorage.removeItem('yeonsinnema_phone');
        setIsAdminMode(false);
        setIsChatOpen(false);
        alert('관리자에 의해 계정이 삭제되어 로그아웃되었습니다.');
      }
    });
    return () => unsub();
  }, [db, appUser?.phone]);

  // 2. 실시간 데이터 불러오기 (Firestore)
  useEffect(() => {
    if (!user || !db || !appUser) return;

    const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'comments');
    const unsubComments = onSnapshot(commentsRef, (snapshot) => {
      const loadedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedComments.sort((a, b) => b.timestamp - a.timestamp); 
      setComments(loadedComments);
    });

    const attendanceRef = collection(db, 'artifacts', appId, 'public', 'data', 'attendance');
    const unsubAttendance = onSnapshot(attendanceRef, (snapshot) => {
      const loadedAttendance = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedAttendance.sort((a, b) => b.timestamp - a.timestamp);
      setAttendance(loadedAttendance);
    });

    const chatRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
    const unsubChat = onSnapshot(chatRef, (snapshot) => {
      const loadedChat = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedChat.sort((a, b) => a.timestamp - b.timestamp); 
      setChatMessages(loadedChat);
    });

    return () => {
      unsubComments();
      unsubAttendance();
      unsubChat();
    };
  }, [user, appUser]);

  // 3. 관리자용 회원 목록 불러오기
  useEffect(() => {
    if (!user || !db || !isAdminMode) return;
    const profilesRef = collection(db, 'artifacts', appId, 'public', 'data', 'profiles');
    const unsubProfiles = onSnapshot(profilesRef, (snapshot) => {
      const loadedProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedProfiles.sort((a, b) => b.createdAt - a.createdAt);
      setProfiles(loadedProfiles);
    });
    return () => unsubProfiles();
  }, [user, isAdminMode, db]);

  // 4. 새 메시지 알림 (소리 및 진동) & 스크롤
  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      prevChatLengthRef.current = chatMessages.length;
      return;
    }

    if (chatMessages.length > prevChatLengthRef.current) {
      const newMsg = chatMessages[chatMessages.length - 1];
      
      if (newMsg.phone !== appUser?.phone && !isMuted) {
        // [수정됨] 소리 재생 에러 처리 강화
        if (notificationSound.current) {
          notificationSound.current.play().catch(e => console.log("소리 재생 실패:", e));
        }
        
        // 스마트폰 진동 
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([200]); 
          } catch (e) {
            console.log("진동 실패:", e);
          }
        }
      }
      
      if (isChatOpen) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
    prevChatLengthRef.current = chatMessages.length;
  }, [chatMessages, isMuted, appUser, isChatOpen]);


  // --- 인증 관련 함수 ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!user || !db) return;
    
    if (BLOCKED_NUMBERS.includes(phoneInput)) {
      setAuthError('해당 번호는 서비스 이용이 영구 제한되었습니다.');
      return;
    }

    if (phoneInput.length !== 4) {
      setAuthError('전화번호 뒷 4자리를 정확히 입력해주세요.');
      return;
    }

    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phoneInput);

    try {
      if (authMode === 'login') {
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setAppUser(profileSnap.data());
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
        
        const userInfo = { nickname: nicknameInput, phone: phoneInput, uid: user.uid, createdAt: Date.now(), attendanceCount: 0 };
        await setDoc(profileRef, userInfo);
        setAppUser(userInfo);
        localStorage.setItem('yeonsinnema_phone', phoneInput);
      }
    } catch (error) {
      console.log(error);
      setAuthError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleLogout = () => {
    setAppUser(null);
    setPhoneInput('');
    setNicknameInput('');
    setIsAdminMode(false);
    setIsChatOpen(false);
    localStorage.removeItem('yeonsinnema_phone');
  };

  // --- 관리자 모드 관련 함수 ---
  const handleAdminLoginSubmit = (e) => {
    e.preventDefault();
    if (adminPinInput === ADMIN_PIN) {
      setIsAdminMode(true);
      setShowAdminModal(false);
      setAdminPinInput('');
      setAuthError('');
    } else {
      setAuthError('비밀번호가 일치하지 않습니다.');
    }
  };

  const adminDeleteProfile = async (phone) => {
    if (!user || !db) return;
    if (window.confirm(`정말로 이 회원(*${phone})을 영구 삭제하시겠습니까?\n삭제된 회원은 즉시 앱에서 쫓겨납니다.`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phone));
      } catch (e) { console.log(e); }
    }
  };

  const adminUpdateAttendanceCount = async (phone, currentCount, delta) => {
    if (!user || !db) return;
    const newCount = Math.max(0, (currentCount || 0) + delta);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phone), { attendanceCount: newCount }, { merge: true });
    } catch (e) { console.log(e); }
  };

  const adminDeleteComment = async (commentId) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comments', commentId));
    } catch (e) { console.log(e); }
  };


  // --- 기능 관련 함수 ---
  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !user || !db) return;
    try {
      const chatRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
      await addDoc(chatRef, {
        nickname: appUser.nickname,
        phone: appUser.phone,
        text: newChatMessage,
        attendanceCount: appUser.attendanceCount || 0,
        timestamp: Date.now()
      });
      setNewChatMessage('');
    } catch (e) { console.log(e); }
  };

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
        attendanceCount: appUser.attendanceCount || 0,
        timestamp: Date.now()
      });
      setNewComment('');
      setRating(5);
    } catch (e) { console.log(e); }
  };

  const deleteComment = async (commentId) => {
    if (!user || !db) return;
    if (window.confirm('감상평을 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'comments', commentId));
      } catch (e) { console.log(e); }
    }
  };

  const toggleAttendance = async (status) => {
    if (!user || !db || !appUser) return;
    try {
      const attendanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'attendance', appUser.phone);
      await setDoc(attendanceRef, {
        nickname: appUser.nickname,
        phone: appUser.phone,
        status: status, 
        attendanceCount: appUser.attendanceCount || 0,
        timestamp: Date.now()
      });
    } catch (e) { console.log(e); }
  };

  const myAttendance = attendance.find(a => a.phone === appUser?.phone);
  const isGoing = myAttendance?.status === 'going';

  // --- 화면 렌더링 ---
  if (isAuthLoading) {
    return <div className="min-h-screen bg-[#011214] flex items-center justify-center text-[#d4af37] tracking-widest font-bold">로딩 중...</div>;
  }

  // --- 관리자 모드 화면 ---
  if (appUser && isAdminMode) {
    return (
      <div className="min-h-screen bg-[#011214] text-gray-200 font-sans p-4 md:p-8 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-gradient-to-r from-[#021a1d] to-[#011214] p-6 rounded-3xl border border-[#d4af37] border-opacity-30 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37] flex items-center gap-3">
            <Settings className="w-8 h-8 text-[#d4af37] animate-[spin_10s_linear_infinite]" /> 사장님 전용 대시보드
          </h1>
          <button onClick={() => setIsAdminMode(false)} className="px-6 py-3 bg-[#011214] border border-[#144950] text-[#d4af37] rounded-xl font-bold hover:bg-[#144950] hover:text-white transition-all shadow-inner">
            라운지로 돌아가기
          </button>
        </header>

        {/* 통계 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 rounded-3xl border border-[#144950] shadow-lg flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1 font-bold tracking-widest">총 가입 회원</p>
              <p className="text-4xl font-extrabold text-[#d4af37]">{profiles.length} <span className="text-lg text-gray-500">명</span></p>
            </div>
            <Users className="w-12 h-12 text-[#144950] opacity-50" />
          </div>
          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 rounded-3xl border border-[#144950] shadow-lg flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1 font-bold tracking-widest">이번 주 참석자</p>
              <p className="text-4xl font-extrabold text-[#d4af37]">{attendance.filter(a => a.status === 'going').length} <span className="text-lg text-gray-500">명</span></p>
            </div>
            <CheckCircle2 className="w-12 h-12 text-[#144950] opacity-50" />
          </div>
          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 rounded-3xl border border-[#144950] shadow-lg flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1 font-bold tracking-widest">등록된 감상평</p>
              <p className="text-4xl font-extrabold text-[#d4af37]">{comments.length} <span className="text-lg text-gray-500">개</span></p>
            </div>
            <MessageSquare className="w-12 h-12 text-[#144950] opacity-50" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* 회원 목록 및 관리 */}
          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 md:p-8 rounded-3xl border border-[#144950] shadow-lg">
            <h2 className="text-xl font-bold text-[#fbf5b7] mb-6 flex items-center gap-2 border-b border-[#144950] pb-4">
              <Users className="w-6 h-6 text-[#d4af37]" /> 가입 회원 전체 관리
            </h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {profiles.length === 0 ? <p className="text-gray-500 text-center py-10">가입한 회원이 없습니다.</p> : profiles.map(profile => (
                <div key={profile.phone} className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center bg-[#011214] p-4 rounded-2xl border border-[#144950] hover:border-[#d4af37] transition-colors gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#021e22] flex items-center justify-center text-[#d4af37] font-black border border-[#144950] flex-shrink-0">
                       {profile.nickname.substring(0,1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-gray-200">{profile.nickname}</span>
                        <TierBadge count={profile.attendanceCount} />
                      </div>
                      <span className="text-xs text-[#d4af37] font-mono tracking-widest">*{profile.phone}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <div className="flex items-center bg-[#021e22] rounded-lg border border-[#144950] p-1 shadow-inner">
                      <button onClick={() => adminUpdateAttendanceCount(profile.phone, profile.attendanceCount, -1)} className="px-2.5 text-gray-400 hover:text-red-400 text-lg font-bold transition-colors">-</button>
                      <div className="flex flex-col items-center justify-center w-8">
                        <span className="text-[9px] text-gray-500 mb-[-4px]">참석</span>
                        <span className="text-sm font-bold text-[#d4af37]">{profile.attendanceCount || 0}</span>
                      </div>
                      <button onClick={() => adminUpdateAttendanceCount(profile.phone, profile.attendanceCount, 1)} className="px-2.5 text-gray-400 hover:text-green-400 text-lg font-bold transition-colors">+</button>
                    </div>
                    <button 
                      onClick={() => adminDeleteProfile(profile.phone)} 
                      className="p-2.5 bg-red-900/20 text-red-400 rounded-lg hover:bg-red-900 hover:text-white transition-colors border border-transparent hover:border-red-500"
                      title="회원 영구 삭제"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 감상평 관리 */}
          <div className="bg-gradient-to-br from-[#03252a] to-[#011619] p-6 md:p-8 rounded-3xl border border-[#144950] shadow-lg">
            <h2 className="text-xl font-bold text-[#fbf5b7] mb-6 flex items-center gap-2 border-b border-[#144950] pb-4">
              <MessageSquare className="w-6 h-6 text-[#d4af37]" /> 감상평 강제 삭제 관리
            </h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {comments.length === 0 ? <p className="text-gray-500 text-center py-10">등록된 감상평이 없습니다.</p> : comments.map(comment => (
                <div key={comment.id} className="bg-[#011214] p-5 rounded-2xl border border-[#144950] relative group">
                  <div className="flex justify-between mb-3">
                     <div className="flex items-center gap-2 flex-wrap">
                       <span className="font-bold text-[#fbf5b7]">{comment.nickname}</span>
                       <TierBadge count={comment.attendanceCount} />
                       <span className="text-xs text-gray-500 font-mono">(*{comment.phone})</span>
                     </div>
                     <div className="flex gap-0.5 ml-2">
                       {[1,2,3,4,5].map(s => <Star key={s} className={`w-3.5 h-3.5 ${comment.rating >= s ? 'text-[#d4af37] fill-[#d4af37]' : 'text-[#144950]'}`} />)}
                     </div>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap pr-10">{comment.text}</p>
                  <button 
                    onClick={() => adminDeleteComment(comment.id)}
                    className="absolute right-4 bottom-4 p-2 bg-red-900 bg-opacity-20 text-red-400 rounded-lg hover:bg-red-900 hover:text-white transition-all border border-transparent hover:border-red-500"
                    title="댓글 즉시 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <style jsx="true">{`
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #011214; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #144950; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4af37; }
        `}</style>
      </div>
    );
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
    <div className="min-h-screen bg-[#011214] text-gray-200 font-sans selection:bg-[#d4af37] selection:text-[#011214] relative">
      
      {/* 관리자 로그인 모달 */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-gradient-to-b from-[#03252a] to-[#011214] p-8 rounded-3xl border border-[#d4af37] shadow-[0_0_40px_rgba(212,175,55,0.2)] w-full max-w-sm relative">
            <button onClick={() => {setShowAdminModal(false); setAuthError('');}} className="absolute top-5 right-5 text-gray-500 hover:text-[#d4af37] transition-colors">
              <X className="w-6 h-6" />
            </button>
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-[#011214] rounded-full border border-[#144950] shadow-inner">
                <Lock className="w-8 h-8 text-[#d4af37]" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-center text-[#fbf5b7] mb-6 tracking-widest">관리자 접속</h3>
            <form onSubmit={handleAdminLoginSubmit}>
              <input
                type="password"
                value={adminPinInput}
                onChange={(e) => setAdminPinInput(e.target.value)}
                placeholder="비밀번호 4자리"
                maxLength={4}
                className="w-full px-4 py-4 rounded-xl bg-[#011214] text-center text-2xl tracking-[1em] text-[#d4af37] border border-[#144950] focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37] mb-2 shadow-inner"
                autoFocus
              />
              <div className="h-6">
                {authError && <p className="text-red-400 text-xs text-center">{authError}</p>}
              </div>
              <button type="submit" className="w-full mt-2 py-4 bg-gradient-to-r from-[#f4d473] to-[#aa801e] text-[#011214] font-bold rounded-xl hover:opacity-90 shadow-lg text-lg">
                대시보드 열기
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 고정 헤더 */}
      <header className="fixed top-0 w-full bg-[#011214] bg-opacity-80 backdrop-blur-lg z-50 border-b border-[#d4af37] border-opacity-10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-xl mx-auto px-5 py-4 flex justify-between items-center">
          <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] via-[#d4af37] to-[#aa801e] flex items-center gap-2 tracking-widest font-serif drop-shadow-sm">
            <Clapperboard className="w-5 h-5 text-[#d4af37]" /> 연신네마
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[#021e22] px-3 py-1.5 rounded-full border border-[#144950] shadow-inner">
              <div className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse shadow-[0_0_8px_#d4af37]"></div>
              <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                <strong className="text-transparent bg-clip-text bg-gradient-to-r from-[#fbf5b7] to-[#d4af37]">{appUser.nickname}</strong>
                <TierBadge count={appUser.attendanceCount} />
              </span>
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
                  <div key={attendee.id} className="bg-[#011214] border border-[#d4af37] border-opacity-40 pl-1 pr-3 py-1.5 rounded-full flex items-center gap-2 shadow-[0_2px_10px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-300">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#fbf5b7] via-[#d4af37] to-[#9c7e1c] flex items-center justify-center flex-shrink-0 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.3)]">
                      <span className="text-[#011214] font-black text-xs">{attendee.nickname.substring(0,1)}</span>
                    </div>
                    <span className="text-gray-100 font-medium text-sm tracking-wide mr-1">{attendee.nickname}</span>
                    <TierBadge count={attendee.attendanceCount} />
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
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-bold text-gray-100 tracking-wide">{comment.nickname}</span>
                          <TierBadge count={comment.attendanceCount} />
                        </div>
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
      
      {/* 푸터 (채팅버튼 공간을 위해 pb-24 추가) */}
      <footer className="border-t border-[#144950] py-10 text-center bg-[#010a0b] pb-24 relative">
        <Clapperboard className="w-6 h-6 text-[#144950] mx-auto mb-4" />
        <p className="text-xs text-[#d4af37] opacity-40 uppercase tracking-widest font-mono">Yeonsinnema Private Club</p>
        <div className="flex items-center justify-center gap-2 mt-2 text-gray-600">
          <p className="text-[10px]">© 2026 Board Game Cafe. All rights reserved.</p>
          <button onClick={() => {setShowAdminModal(true); setAuthError('');}} className="p-1 hover:text-[#d4af37] transition-colors opacity-50 hover:opacity-100" title="관리자 모드 접속">
            <Lock className="w-3 h-3" />
          </button>
        </div>
      </footer>

      {/* 플로팅 채팅 버튼 */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-[#f4d473] to-[#aa801e] rounded-full shadow-[0_10px_30px_rgba(212,175,55,0.4)] flex items-center justify-center text-[#011214] hover:scale-110 transition-transform z-40 border border-[#fbf5b7]"
      >
        {isChatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* 라이브 채팅 슬라이드 패널 */}
      {isChatOpen && (
        <div className="fixed bottom-24 right-4 md:right-6 w-[calc(100%-2rem)] md:w-96 bg-gradient-to-b from-[#03252a] to-[#011619] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-[#d4af37] border-opacity-40 z-50 overflow-hidden flex flex-col h-[500px] max-h-[70vh] animate-in slide-in-from-bottom-10 fade-in duration-300">
          
          {/* 채팅방 헤더 (무음 토글 버튼 추가됨) */}
          <div className="p-4 bg-[#021a1d] border-b border-[#144950] flex justify-between items-center shadow-md">
            <h3 className="text-[#fbf5b7] font-bold flex items-center gap-2 text-sm tracking-widest">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              LIVE CHAT
            </h3>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMuted(!isMuted)} 
                className="text-[#d4af37] opacity-60 hover:opacity-100 transition-opacity p-1 bg-[#011214] rounded-full border border-[#144950]"
                title={isMuted ? "알림 켜기" : "알림 끄기"}
              >
                {isMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              </button>
              <span className="text-xs text-[#d4af37] opacity-60">연신네마 라운지</span>
            </div>
          </div>

          {/* 대화창 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {chatMessages.length === 0 ? (
              <p className="text-center text-gray-500 text-xs mt-10">채팅방이 조용합니다. 첫 인사를 건네보세요!</p>
            ) : (
              chatMessages.map((msg) => {
                const isMe = msg.phone === appUser.phone;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && (
                      <div className="flex items-center gap-1.5 mb-1 ml-1">
                        <span className="text-[10px] text-gray-400 font-bold">{msg.nickname}</span>
                        <TierBadge count={msg.attendanceCount} />
                      </div>
                    )}
                    <div className={`px-4 py-2.5 max-w-[80%] text-sm shadow-md ${
                      isMe 
                      ? 'bg-gradient-to-r from-[#e5c158] to-[#d4af37] text-[#011214] rounded-2xl rounded-tr-sm font-medium' 
                      : 'bg-[#021e22] text-gray-200 border border-[#144950] rounded-2xl rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-gray-600 mt-1 mx-1">
                      {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 채팅 입력 영역 */}
          <div className="p-3 bg-[#011214] border-t border-[#144950]">
            <form onSubmit={sendChatMessage} className="flex gap-2">
              <input
                type="text"
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                placeholder="메시지를 입력하세요..."
                className="flex-1 bg-[#021a1d] text-gray-200 px-4 py-2.5 rounded-full border border-[#144950] focus:outline-none focus:border-[#d4af37] text-sm shadow-inner placeholder-gray-600"
              />
              <button
                type="submit"
                disabled={!newChatMessage.trim()}
                className="w-10 h-10 rounded-full bg-[#d4af37] text-[#011214] flex items-center justify-center hover:bg-[#fbf5b7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex-shrink-0"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #144950; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4af37; }
      `}</style>
    </div>
  );
}