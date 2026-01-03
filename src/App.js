import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDocs,
  getDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  orderBy,
} from "firebase/firestore";
import {
  User,
  Lock,
  Mail,
  PiggyBank,
  Trophy,
  CheckCircle2,
  Save,
  RotateCcw,
  Settings,
  Calendar,
  Crown,
  CreditCard,
  ExternalLink,
  ShieldAlert,
  Trash2,
  Heart,
  Plus,
  X,
  LogOut,
  CheckSquare,
  Loader2,
} from "lucide-react";

// ==========================================
// 🟢 Savings Together 設定 (安全讀取環境變數)
// ==========================================
// 使用 helper function 避免在沒設定環境變數時發生 "process is not defined" 錯誤
const getEnv = (key) => {
  try {
    return process.env[key];
  } catch (e) {
    return ""; // 如果 process 不存在，回傳空字串，避免崩潰
  }
};

const firebaseConfig = {
  apiKey: getEnv("REACT_APP_FIREBASE_API_KEY"),
  authDomain: getEnv("REACT_APP_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("REACT_APP_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("REACT_APP_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("REACT_APP_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("REACT_APP_FIREBASE_APP_ID"),
};

// 初始化 Firebase
// 如果沒有讀取到 Config (例如本地未設定 .env)，給予空物件避免初始化錯誤
const app = initializeApp(
  firebaseConfig.apiKey ? firebaseConfig : { apiKey: "", projectId: "" }
);
const auth = getAuth(app);
const db = getFirestore(app);

// 設定資料庫存取的路徑 ID
const appId =
  typeof __app_id !== "undefined"
    ? __app_id
    : getEnv("REACT_APP_FIREBASE_PROJECT_ID") || "savings-together-e9667";

// --- THEME CONFIG (IG Style) ---
const theme = {
  bg: "bg-[#FAFAF9]",
  card: "bg-white",
  primary: "bg-[#C5A880]",
  primaryHover: "hover:bg-[#B0926D]",
  secondary: "bg-[#E6D5B8]",
  accent: "text-[#8B7355]",
  textMain: "text-[#4A4A4A]",
  gridSaved: "bg-[#C5A880]",
};

const DAYS_COUNT = 365;
const TOTAL_GOAL = (DAYS_COUNT * (DAYS_COUNT + 1)) / 2;

export default function App() {
  // --- 自動載入 Tailwind CSS ---
  useEffect(() => {
    if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
      const script = document.createElement("script");
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // Global
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [config, setConfig] = useState({ year: 2026 });
  const [loading, setLoading] = useState(true);

  // Jars State
  const [myJars, setMyJars] = useState([]);
  const [activeJarId, setActiveJarId] = useState(null);
  const [isCreatingJar, setIsCreatingJar] = useState(false);
  const [newJarName, setNewJarName] = useState("");

  // UI
  const [view, setView] = useState("login");
  const [notification, setNotification] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Forms
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nickname: "",
  });

  // Editing State
  const [localSavedDays, setLocalSavedDays] = useState([]);
  const [isDirty, setIsDirty] = useState(false);

  // Admin & Leaderboard
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [newYearInput, setNewYearInput] = useState("");
  const [allUsersData, setAllUsersData] = useState([]);

  // --- Listeners ---
  useEffect(() => {
    let mounted = true;

    // ⏳ 安全機制
    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Firebase 連線較慢或 API Key 未設定");
        setLoading(false);
      }
    }, 3000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      try {
        if (user) {
          setCurrentUser(user);
          const userRef = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "pro_users",
            user.uid
          );

          // 監聽使用者資料
          onSnapshot(
            userRef,
            (docSnap) => {
              if (docSnap.exists()) {
                setUserProfile(docSnap.data());
                setView("app");
              }
            },
            (err) => console.error("Profile Error:", err)
          );

          // 監聽存錢桶
          const jarsRef = collection(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "pro_users",
            user.uid,
            "savings_jars"
          );
          const q = query(jarsRef, orderBy("createdAt", "asc"));

          onSnapshot(
            q,
            async (snapshot) => {
              const jars = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));

              if (jars.length === 0) {
                // 初始化
                try {
                  const docSnap = await getDoc(userRef);
                  const oldData = docSnap.data();
                  if (
                    oldData &&
                    oldData.savedDays &&
                    oldData.savedDays.length > 0
                  ) {
                    await addDoc(jarsRef, {
                      name: "我的存錢桶",
                      savedDays: oldData.savedDays,
                      createdAt: new Date().toISOString(),
                    });
                    await updateDoc(userRef, { savedDays: [] });
                  } else {
                    const currentYear = new Date().getFullYear();
                    await addDoc(jarsRef, {
                      name: `${currentYear}存錢桶`,
                      savedDays: [],
                      createdAt: new Date().toISOString(),
                    });
                  }
                } catch (e) {
                  console.error("Init Jar Error:", e);
                }
              } else {
                setMyJars(jars);
                // 邏輯修正：如果 activeJarId 無效（例如剛被刪除），自動切換到第一個存錢桶
                if (!activeJarId || !jars.find((j) => j.id === activeJarId)) {
                  if (jars.length > 0) setActiveJarId(jars[0].id);
                }
              }
            },
            (err) => console.error("Jars Error:", err)
          );
        } else {
          setCurrentUser(null);
          setView("login");
        }
      } catch (err) {
        console.error("Auth Change Error:", err);
      } finally {
        if (mounted) {
          setLoading(false);
          clearTimeout(safetyTimer);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribeAuth();
      clearTimeout(safetyTimer);
    };
  }, []);

  // Sync Local State
  useEffect(() => {
    if (activeJarId && myJars.length > 0) {
      const jar = myJars.find((j) => j.id === activeJarId);
      if (jar) {
        setLocalSavedDays(jar.savedDays || []);
        setIsDirty(false);
      }
    }
  }, [activeJarId, myJars]);

  // Global Config & Leaderboard
  useEffect(() => {
    if (!currentUser) return;
    const configRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "app_settings",
      "config"
    );
    const unsubConfig = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) setConfig(snap.data());
        else setDoc(configRef, { year: 2026 }, { merge: true });
      },
      (err) => console.error("Config Error:", err)
    );

    const usersColRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "pro_users"
    );
    const unsubUsers = onSnapshot(
      usersColRef,
      (snapshot) => {
        const users = [];
        snapshot.forEach((doc) => users.push({ uid: doc.id, ...doc.data() }));
        setAllUsersData(users);
      },
      (err) => console.error("Users Error:", err)
    );

    return () => {
      unsubConfig();
      unsubUsers();
    };
  }, [currentUser]);

  // --- Logic ---

  const showNotification = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleInputChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.nickname) {
      showNotification("請填寫所有欄位", "error");
      return;
    }
    setActionLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const usersSnap = await getDocs(
        collection(db, "artifacts", appId, "public", "data", "pro_users")
      );

      await setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "pro_users",
          cred.user.uid
        ),
        {
          email: formData.email,
          nickname: formData.nickname,
          role: usersSnap.empty ? "admin" : "member",
          joinedAt: new Date().toISOString(),
          totalWealth: 0,
          totalDays: 0,
        }
      );
      showNotification("註冊成功！");
    } catch (error) {
      if (error.code === "auth/email-already-in-use")
        showNotification("此信箱已被註冊", "error");
      else showNotification(error.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
    } catch (e) {
      showNotification("登入失敗，請檢查信箱或密碼", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!formData.email) return showNotification("請輸入信箱", "error");
    try {
      await sendPasswordResetEmail(auth, formData.email);
      showNotification("重設信已寄出", "success");
      setView("login");
    } catch (e) {
      showNotification("發送失敗", "error");
    }
  };

  const createJar = async (e) => {
    e.preventDefault();
    if (!newJarName.trim()) return;
    try {
      const jarsRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "pro_users",
        currentUser.uid,
        "savings_jars"
      );
      const docRef = await addDoc(jarsRef, {
        name: newJarName,
        savedDays: [],
        createdAt: new Date().toISOString(),
      });
      setNewJarName("");
      setIsCreatingJar(false);
      setActiveJarId(docRef.id);
      showNotification("新存錢桶建立成功！");
    } catch (e) {
      showNotification("建立失敗", "error");
    }
  };

  // 修正：確保刪除後正確更新統計數據與 UI
  const deleteJar = async (jarId) => {
    if (myJars.length <= 1) {
      showNotification("至少要保留一個存錢桶喔", "error");
      return;
    }

    if (!confirm("確定要刪除這個存錢桶嗎？")) return;

    try {
      // 1. 刪除資料庫中的文件
      await deleteDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "pro_users",
          currentUser.uid,
          "savings_jars",
          jarId
        )
      );

      // 2. 更新使用者統計數據 (傳入已刪除的 ID 以便在計算時排除)
      await updateUserStats(jarId);

      // 3. UI 狀態更新 (切換到其他存錢桶)
      // 注意：這裡先做切換，雖然 Listener 稍後會自動同步，但這樣可以讓體驗更流暢
      const remainingJars = myJars.filter((jar) => jar.id !== jarId);
      if (remainingJars.length > 0) {
        setActiveJarId(remainingJars[0].id);
      }

      showNotification("存錢桶已刪除");
    } catch (e) {
      console.error("Delete Error:", e);
      showNotification("刪除失敗，請檢查網路", "error");
    }
  };

  const toggleDayLocally = (dayNumber) => {
    if (!activeJarId) return;
    setLocalSavedDays((prev) => {
      const newDays = prev.includes(dayNumber)
        ? prev.filter((d) => d !== dayNumber)
        : [...prev, dayNumber];
      const currentJar = myJars.find((j) => j.id === activeJarId);
      const dbDays = currentJar?.savedDays || [];
      const sortedNew = [...newDays].sort((a, b) => a - b);
      const sortedDb = [...dbDays].sort((a, b) => a - b);
      setIsDirty(JSON.stringify(sortedNew) !== JSON.stringify(sortedDb));
      return newDays;
    });
  };

  const saveChanges = async () => {
    if (!currentUser || !activeJarId) return;
    try {
      const jarRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "pro_users",
        currentUser.uid,
        "savings_jars",
        activeJarId
      );
      await updateDoc(jarRef, { savedDays: localSavedDays });

      // 更新統計
      let newTotalWealth = 0;
      let newTotalDays = 0;
      myJars.forEach((jar) => {
        // 如果是目前正在編輯的存錢桶，使用最新的本地狀態
        const days = jar.id === activeJarId ? localSavedDays : jar.savedDays;
        newTotalWealth += days.reduce((a, b) => a + b, 0);
        newTotalDays += days.length;
      });

      const userRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "pro_users",
        currentUser.uid
      );
      await updateDoc(userRef, {
        totalWealth: newTotalWealth,
        totalDays: newTotalDays,
      });

      setIsDirty(false);
      showNotification("存錢進度已更新！");
    } catch (err) {
      showNotification("儲存失敗", "error");
    }
  };

  // Helper function: 計算並更新總資產 (排除特定的 Jar ID)
  const updateUserStats = async (deletedJarId = null) => {
    let newTotalWealth = 0;
    let newTotalDays = 0;

    // 遍歷目前的存錢桶列表 (myJars 還是舊的狀態，所以要手動過濾)
    myJars.forEach((jar) => {
      if (jar.id !== deletedJarId) {
        newTotalWealth += jar.savedDays.reduce((a, b) => a + b, 0);
        newTotalDays += jar.savedDays.length;
      }
    });

    const userRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "pro_users",
      currentUser.uid
    );
    await updateDoc(userRef, {
      totalWealth: newTotalWealth,
      totalDays: newTotalDays,
    });
  };

  // Admin
  const openAdminPanel = () => {
    if (userProfile?.role !== "admin") return;
    setView("admin");
    setAdminUsersList(allUsersData);
  };
  const updateYear = async () => {
    if (!newYearInput) return;
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "app_settings", "config"),
      { year: parseInt(newYearInput) }
    );
    showNotification("年份更新完成");
  };
  const deleteUser = async (uid, name) => {
    if (!confirm(`刪除 ${name}？`)) return;
    await deleteDoc(
      doc(db, "artifacts", appId, "public", "data", "pro_users", uid)
    );
    showNotification("已刪除");
  };

  // Computed
  const activeJar = useMemo(
    () => myJars.find((j) => j.id === activeJarId),
    [myJars, activeJarId]
  );
  const currentJarTotal = useMemo(
    () => localSavedDays.reduce((a, b) => a + b, 0),
    [localSavedDays]
  );

  const myStats = useMemo(() => {
    if (!activeJarId) return { wealth: 0, days: 0 };
    let wealth = 0;
    let days = 0;
    myJars.forEach((jar) => {
      const currentDays =
        jar.id === activeJarId ? localSavedDays : jar.savedDays || [];
      wealth += currentDays.reduce((a, b) => a + b, 0);
      days += currentDays.length;
    });
    return { wealth, days };
  }, [myJars, localSavedDays, activeJarId]);

  // Leaderboard Sorted by Total Days
  const leaderboard = useMemo(() => {
    return allUsersData
      .map((u) => ({
        ...u,
        total: u.totalWealth || 0,
        days: u.totalDays || 0,
      }))
      .sort((a, b) => b.days - a.days); // Sort by days descending
  }, [allUsersData]);

  // --- Render ---
  // Ensure styles loaded
  if (loading) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center ${theme.bg} ${theme.textMain}`}
      >
        <Loader2 className="w-10 h-10 animate-spin text-[#C5A880] mb-4" />
        <p className="text-sm text-gray-500 font-medium">系統連線中...</p>
      </div>
    );
  }

  // LOGIN / REGISTER / FORGOT PW
  if (["login", "register", "forgot-pw"].includes(view)) {
    return (
      <div
        className={`min-h-screen ${theme.bg} flex items-center justify-center p-6 font-sans`}
      >
        {notification && (
          <div
            className={`fixed top-6 px-6 py-3 rounded-full shadow-lg text-white text-sm font-medium z-50 ${
              notification.type === "error" ? "bg-red-400" : "bg-[#8B7355]"
            }`}
          >
            {notification.msg}
          </div>
        )}

        <div className="w-full max-w-md bg-white rounded-[2rem] shadow-xl overflow-hidden border border-[#F0EAE0]">
          <div className={`p-10 text-center ${theme.primary} relative`}>
            <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
              <PiggyBank className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-white">
              {config.year} 存錢計畫
            </h1>
            <p className="text-white/80 text-xs mt-1">
              多存錢桶管理・達成更多目標
            </p>
          </div>
          <div className="p-8">
            <div className="flex gap-4 mb-6 border-b border-gray-100 pb-1">
              <button
                onClick={() => setView("login")}
                className={`flex-1 pb-3 text-sm font-medium ${
                  view === "login"
                    ? "text-[#8B7355] border-b-2 border-[#8B7355]"
                    : "text-gray-400"
                }`}
              >
                登入
              </button>
              <button
                onClick={() => setView("register")}
                className={`flex-1 pb-3 text-sm font-medium ${
                  view === "register"
                    ? "text-[#8B7355] border-b-2 border-[#8B7355]"
                    : "text-gray-400"
                }`}
              >
                註冊
              </button>
            </div>

            <form
              onSubmit={
                view === "login"
                  ? handleLogin
                  : view === "register"
                  ? handleRegister
                  : handleForgotPassword
              }
              className="space-y-4"
            >
              {view === "register" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8B7355] ml-1 tracking-wider">
                    顯示暱稱
                  </label>
                  <input
                    type="text"
                    name="nickname"
                    required
                    placeholder="朋友會看到的名稱"
                    value={formData.nickname}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-[#FAFAF9] rounded-xl text-sm outline-none focus:border-[#C5A880] border border-transparent transition-colors"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8B7355] ml-1 tracking-wider">
                  電子信箱 (帳號)
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="hello@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-4 bg-[#FAFAF9] rounded-xl text-sm outline-none focus:border-[#C5A880] border border-transparent transition-colors"
                />
              </div>
              {view !== "forgot-pw" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8B7355] ml-1 tracking-wider">
                    密碼
                  </label>
                  <input
                    type="password"
                    name="password"
                    required
                    placeholder="至少6位數"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-[#FAFAF9] rounded-xl text-sm outline-none focus:border-[#C5A880] border border-transparent transition-colors"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={actionLoading}
                className={`w-full ${theme.primary} ${theme.primaryHover} text-white font-medium py-4 rounded-xl shadow-lg mt-4 transition-transform active:scale-95`}
              >
                {actionLoading
                  ? "..."
                  : view === "login"
                  ? "進入我的存錢桶"
                  : view === "register"
                  ? "開始存錢"
                  : "發送重設信"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() =>
                  setView(view === "login" ? "forgot-pw" : "login")
                }
                className="text-xs text-[#8B7355]/70 hover:text-[#8B7355]"
              >
                {view === "login" ? "忘記密碼？" : "返回登入"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ADMIN PANEL
  if (view === "admin") {
    return (
      <div className={`min-h-screen ${theme.bg} p-6`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1
              className={`text-2xl font-serif font-bold ${theme.textMain} flex items-center gap-2`}
            >
              <ShieldAlert className="text-[#C5A880]" /> 版主管理後台
            </h1>
            <button
              onClick={() => setView("app")}
              className="px-5 py-2 bg-white text-[#8B7355] rounded-xl shadow-sm font-medium"
            >
              返回前台
            </button>
          </div>
          <div className="grid gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#F0EAE0]">
              <h2
                className={`font-bold text-lg mb-4 flex items-center gap-2 ${theme.textMain}`}
              >
                <Settings size={18} /> 全域設定
              </h2>
              <div className="flex gap-4">
                <input
                  type="number"
                  placeholder={config.year}
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  className="flex-1 p-3 border border-[#E6E6E6] rounded-xl"
                />
                <button
                  onClick={updateYear}
                  className={`${theme.primary} text-white px-6 py-3 rounded-xl font-medium`}
                >
                  更新年份
                </button>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#F0EAE0]">
              <h2
                className={`font-bold text-lg mb-4 flex items-center gap-2 ${theme.textMain}`}
              >
                <User size={18} /> 會員列表 ({adminUsersList.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[#8B7355] border-b border-[#F0EAE0]">
                    <tr>
                      <th className="p-3">暱稱</th>
                      <th className="p-3">信箱</th>
                      <th className="p-3">身分</th>
                      <th className="p-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsersList.map((u) => (
                      <tr
                        key={u.uid}
                        className="border-b border-gray-50 hover:bg-[#FAFAF9]"
                      >
                        <td className="p-3 font-medium text-gray-700">
                          {u.nickname}
                        </td>
                        <td className="p-3 text-gray-500">{u.email}</td>
                        <td className="p-3">
                          {u.role === "admin" ? (
                            <span className="bg-[#E6D5B8] text-[#5F4B32] px-2 py-1 rounded text-xs font-bold">
                              版主
                            </span>
                          ) : (
                            "會員"
                          )}
                        </td>
                        <td className="p-3">
                          {u.role !== "admin" && (
                            <button
                              onClick={() => deleteUser(u.uid, u.nickname)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div
      className={`min-h-screen ${theme.bg} pb-32 font-sans selection:bg-[#C5A880] selection:text-white`}
    >
      {notification && (
        <div
          className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-xl text-white text-sm font-medium z-50 ${
            notification.type === "error" ? "bg-red-400" : "bg-[#8B7355]"
          }`}
        >
          {notification.msg}
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#F0EAE0]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`${theme.secondary} p-2 rounded-xl text-[#5F4B32]`}>
              <Calendar size={20} />
            </div>
            <div>
              <h1
                className={`font-serif font-bold ${theme.textMain} text-lg leading-none`}
              >
                {config.year} 存錢挑戰
              </h1>
              <p className={`text-xs ${theme.accent} mt-1 font-medium`}>
                總資產：${myStats.wealth.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {userProfile?.role === "admin" && (
              <button
                onClick={openAdminPanel}
                className="p-2 bg-[#F5F5F4] text-[#8B7355] rounded-full hover:bg-[#E7E5E4]"
              >
                <Settings size={18} />
              </button>
            )}
            <button
              onClick={() => signOut(auth)}
              className="p-2 bg-[#F5F5F4] hover:text-red-400 rounded-full hover:bg-red-50"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Jar Selector Tabs */}
        <div className="flex overflow-x-auto pb-2 gap-2 custom-scrollbar">
          {myJars.map((jar) => (
            <button
              key={jar.id}
              onClick={() => {
                if (!isDirty) setActiveJarId(jar.id);
                else showNotification("請先儲存變更", "error");
              }}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                activeJarId === jar.id
                  ? `${theme.primary} text-white shadow-md`
                  : "bg-white text-gray-400 border border-[#F0EAE0]"
              }`}
            >
              {jar.name}
              {activeJarId === jar.id && (
                <span className="text-[10px] bg-white/20 px-1.5 rounded-full">
                  ${jar.savedDays.reduce((a, b) => a + b, 0).toLocaleString()}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => setIsCreatingJar(true)}
            className="whitespace-nowrap px-3 py-2 rounded-full bg-[#E6D5B8] text-[#5F4B32] text-sm font-bold hover:bg-[#D4C4A8] transition-colors flex items-center gap-1"
          >
            <Plus size={14} /> 新增存錢桶
          </button>
        </div>

        {/* New Jar Modal */}
        {isCreatingJar && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
              <h3 className="font-bold text-lg mb-4 text-[#5F4B32]">
                新增存錢桶
              </h3>
              <input
                autoFocus
                type="text"
                placeholder="例如：日本旅遊基金"
                value={newJarName}
                onChange={(e) => setNewJarName(e.target.value)}
                className="w-full p-3 border border-[#E6E6E6] rounded-xl mb-4 outline-none focus:border-[#C5A880]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setIsCreatingJar(false)}
                  className="flex-1 py-3 text-gray-400 font-bold bg-gray-100 rounded-xl"
                >
                  取消
                </button>
                <button
                  onClick={createJar}
                  className={`flex-1 py-3 text-white font-bold ${theme.primary} rounded-xl`}
                >
                  建立
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Jar Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            className={`bg-[#4A4036] rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden`}
          >
            <a
              href="https://nayomoney.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 backdrop-blur-md pl-3 pr-2 py-1.5 rounded-full text-[10px] font-bold text-[#E6D5B8] flex items-center gap-1 border border-white/5 tracking-wider uppercase"
            >
              申辦 <ExternalLink size={10} />
            </a>

            <div className="relative z-10">
              <div className="mb-2">
                <p className="text-[#C5A880] text-xs font-bold tracking-widest uppercase mb-1">
                  Current Goal
                </p>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-serif font-bold">
                    {activeJar?.name || "載入中..."}
                  </h2>
                  <button
                    onClick={() => deleteJar(activeJarId)}
                    className="text-white/20 hover:text-red-400 transition p-1"
                    title="刪除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-5xl font-serif font-medium tracking-tight">
                  ${currentJarTotal.toLocaleString()}
                </span>
                <span className="text-white/40 font-medium">
                  / ${TOTAL_GOAL.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full transition-all duration-700 ease-out ${
                    isDirty ? "bg-[#D4C4A8]" : "bg-[#C5A880]"
                  }`}
                  style={{ width: `${(currentJarTotal / TOTAL_GOAL) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-[#E6D5B8]/80 font-medium">
                <span>
                  達成率 {((currentJarTotal / TOTAL_GOAL) * 100).toFixed(1)}%
                </span>
                <span>{isDirty ? "未儲存變更" : "已同步"}</span>
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#C5A880]/10 rounded-full blur-2xl"></div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-[#F0EAE0] flex flex-col max-h-[260px]">
            <div className="flex items-center justify-between mb-6 pb-2 border-b border-[#F0EAE0]">
              <div className="flex items-center gap-2 text-[#5F4B32]">
                <Trophy className="w-4 h-4 text-[#C5A880]" />
                <h3 className="font-bold text-sm tracking-wide">堅持排行榜</h3>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {leaderboard.map((stat, idx) => (
                <div
                  key={stat.uid}
                  className="flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold ${
                        idx === 0
                          ? "bg-[#C5A880] text-white"
                          : "bg-[#F5F5F4] text-gray-400"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <div
                        className={`text-sm font-bold ${
                          stat.uid === currentUser.uid
                            ? "text-[#8B7355]"
                            : "text-gray-600"
                        }`}
                      >
                        {stat.nickname}
                      </div>
                      {stat.role === "admin" && (
                        <Crown
                          size={10}
                          className="fill-[#C5A880] text-[#C5A880]"
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#5F4B32] flex items-center justify-end gap-1">
                      {stat.days}{" "}
                      <span className="text-xs font-normal opacity-70">格</span>
                    </div>
                    <div className="text-[10px] text-gray-400 opacity-60 group-hover:opacity-100 transition">
                      ${stat.total.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-[#F0EAE0] overflow-hidden">
          <div className="p-6 bg-[#FAFAF9] border-b border-[#F0EAE0] flex justify-between items-center">
            <h3 className={`font-serif font-bold ${theme.textMain}`}>
              每日存錢格 ({activeJar?.name})
            </h3>
            <div className="flex gap-2 text-xs font-medium text-[#8B7355]">
              <span className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md shadow-sm border border-[#F0EAE0]">
                <div
                  className={`w-2 h-2 rounded-full ${theme.gridSaved}`}
                ></div>
                已存
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-8 bg-white">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 sm:gap-3">
              {Array.from({ length: DAYS_COUNT }, (_, i) => i + 1).map(
                (day) => {
                  const isSelectedLocal = localSavedDays.includes(day);
                  const isSelectedDB =
                    activeJar?.savedDays?.includes(day) || false;
                  let className =
                    "bg-[#FAFAF9] text-[#C0C0C0] hover:bg-[#F5F5F4] hover:text-[#8B7355]";
                  let style = {};

                  if (isSelectedLocal) {
                    if (isSelectedDB) {
                      const opacity = 0.5 + (day / DAYS_COUNT) * 0.5;
                      className =
                        "text-white shadow-md shadow-[#C5A880]/30 transform scale-[1.02] z-10";
                      style = {
                        backgroundColor: `rgba(197, 168, 128, ${opacity})`,
                      };
                    } else {
                      className =
                        "bg-[#E6D5B8] text-[#5F4B32] shadow-inner ring-2 ring-[#C5A880]/50";
                    }
                  }

                  return (
                    <button
                      key={day}
                      onClick={() => toggleDayLocally(day)}
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${className}`}
                      style={style}
                    >
                      <span className="text-[10px] sm:text-xs font-medium">
                        ${day}
                      </span>
                      {isSelectedLocal && isSelectedDB && (
                        <Heart className="absolute -top-1 -right-1 w-3 h-3 fill-white text-white drop-shadow-sm" />
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Action Bar */}
      {isDirty && (
        <div className="fixed bottom-8 left-0 right-0 px-4 flex justify-center z-40 animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-[#4A4036]/90 backdrop-blur-xl text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 max-w-sm w-full border border-white/10">
            <div className="flex-1 pl-2">
              <p className="font-bold text-[#E6D5B8] text-sm">
                您有尚未儲存的變更
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLocalSavedDays(activeJar?.savedDays || [])}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/70 transition"
              >
                <RotateCcw size={18} />
              </button>
              <button
                onClick={saveChanges}
                className={`px-6 py-3 ${theme.primary} hover:bg-[#B0926D] text-white font-bold rounded-full shadow-lg flex items-center gap-2 transition active:scale-95`}
              >
                <Save size={16} /> 儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ad Button */}
      {!isDirty && (
        <div className="fixed bottom-6 right-6 z-30">
          <a
            href="https://nayomoney.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white/90 backdrop-blur-md border border-[#F0EAE0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] pl-2 pr-5 py-2 rounded-full hover:-translate-y-1 transition-all duration-300 group"
          >
            <div className="bg-[#4A4036] p-2.5 rounded-full text-[#C5A880] group-hover:rotate-12 transition-transform">
              <CreditCard size={18} />
            </div>
            <div className="text-left">
              <p className="text-[9px] text-[#8B7355] font-bold tracking-wider opacity-60">
                推薦服務
              </p>
              <p className="text-sm font-serif font-bold text-[#4A4036]">
                Nayo Money
              </p>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
