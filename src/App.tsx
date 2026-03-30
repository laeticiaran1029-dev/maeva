import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { 
  Users, 
  Calendar, 
  MessageSquare, 
  Image as ImageIcon, 
  CheckCircle2, 
  Send, 
  Loader2, 
  Plus, 
  LayoutDashboard,
  ChevronRight,
  Sparkles,
  Download,
  AlertCircle,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  ClipboardList,
  Search,
  Check,
  X,
  Edit2,
  Trash2,
  ListChecks,
  UserCircle,
  LogOut,
  ImagePlus,
  ChevronLeft,
  Camera,
  Settings,
  Activity,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import Markdown from 'react-markdown';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { QRCodeCanvas } from 'qrcode.react';
import { cn } from './lib/utils';
import { Event, AttendanceRecord, ChatMessage, Member } from './types';

// Extend window for AI Studio API key selection
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [appMode, setAppMode] = useState<'selection' | 'admin' | 'member'>('selection');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  // Member Auth state
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [memberLoginId, setMemberLoginId] = useState('');
  const [isMemberLoggingIn, setIsMemberLoggingIn] = useState(false);

  const [memberSubMode, setMemberSubMode] = useState<'check-in' | 'register' | 'request-code'>('check-in');
  const [memberEtuId, setMemberEtuId] = useState('');
  const [presenceCode, setPresenceCode] = useState('');
  const [lastPresenceCode, setLastPresenceCode] = useState<string | null>(null);
  const [memberCheckInError, setMemberCheckInError] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Event CRUD state
  const [eventForm, setEventForm] = useState({ title: '', date: '', description: '' });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Member CRUD state
  const [memberForm, setMemberForm] = useState({ id: '', name: '', email: '', role: 'Volunteer', presenceCode: '' });
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Reunion/Checklist state
  const [reunionEventId, setReunionEventId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [assigningCode, setAssigningCode] = useState<{ id: string, code: string } | null>(null);

  // Check-in state
  const [selectedEventId, setSelectedEventId] = useState('');
  const [checkInStatus, setCheckInStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [showMyId, setShowMyId] = useState(false);

  // Poster state
  const [posterPrompt, setPosterPrompt] = useState('');
  const [posterSize, setPosterSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, attendanceRes, membersRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/attendance'),
        fetch('/api/members')
      ]);
      const eventsData = await eventsRes.json();
      const attendanceData = await attendanceRes.json();
      const membersData = await membersRes.json();
      setEvents(eventsData);
      setAttendance(attendanceData);
      setMembers(membersData);

      // Update current member if logged in
      if (currentMember) {
        const updatedMember = membersData.find((m: Member) => m.id === currentMember.id);
        if (updatedMember) {
          // Notify if the code was previously missing and is now present
          if (updatedMember.presenceCode !== currentMember.presenceCode && updatedMember.presenceCode && !currentMember.presenceCode) {
            toast.success(`Votre code de présence a été assigné : ${updatedMember.presenceCode}`, {
              icon: <Bell className="w-4 h-4" />,
              duration: 10000,
            });
          }
          setCurrentMember(updatedMember);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentMember]);

  useEffect(() => {
    fetchData();
    checkApiKey();

    // Polling for updates (especially for members waiting for codes)
    const interval = setInterval(() => {
      fetchData();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const checkApiKey = async () => {
    if (window.aistudio) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    }
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  // Removed redundant useEffect that was updating currentMember without toast logic
  // (Previously at lines 138-145)

  const togglePresence = async (memberId: string) => {
    if (!reunionEventId) return;
    
    const isPresent = attendance.some(r => r.studentId === memberId && r.eventId === reunionEventId);
    
    try {
      if (isPresent) {
        await fetch('/api/unverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: memberId, eventId: reunionEventId })
        });
      } else {
        await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: memberId, eventId: reunionEventId })
        });
      }
      fetchData();
    } catch (error) {
      console.error("Error toggling presence:", error);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm)
      });
      if (res.ok) {
        setEventForm({ title: '', date: '', description: '' });
        fetchData();
        alert('Événement créé !');
      }
    } catch (error) {
      console.error("Error creating event:", error);
    }
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEventId) return;
    try {
      const res = await fetch(`/api/events/${editingEventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm)
      });
      if (res.ok) {
        setEditingEventId(null);
        setEventForm({ title: '', date: '', description: '' });
        fetchData();
        alert('Événement mis à jour !');
      }
    } catch (error) {
      console.error("Error updating event:", error);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
        alert('Événement supprimé !');
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemberId) return;
    try {
      const res = await fetch(`/api/members/${editingMemberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberForm)
      });
      if (res.ok) {
        setEditingMemberId(null);
        setMemberForm({ id: '', name: '', email: '', role: 'Volunteer', presenceCode: '' });
        fetchData();
        alert('Membre mis à jour !');
      }
    } catch (error) {
      console.error("Error updating member:", error);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
        alert('Membre supprimé !');
      }
    } catch (error) {
      console.error("Error deleting member:", error);
    }
  };

  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, id, role } = memberForm;
    if (!name || !email || !id) {
      alert('Tous les champs sont requis.');
      return;
    }

    const etuRegex = /^ETU\d{4}$/;
    if (!etuRegex.test(id)) {
      alert('Format ID invalide. Utilisez ETUXXXX (ex: ETU4386)');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberForm)
      });
      if (res.ok) {
        setMemberForm({ id: '', name: '', email: '', role: 'Volunteer', presenceCode: '' });
        fetchData();
        alert(`Membre enregistré avec succès ! Vous pouvez maintenant vous connecter.`);
        setMemberSubMode('check-in');
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de l\'inscription.');
      }
    } catch (error) {
      console.error("Error registering member:", error);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRequestCode = async (id: string) => {
    try {
      const res = await fetch('/api/members/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
        alert('Demande de code envoyée à l\'admin !');
      }
    } catch (error) {
      console.error("Error requesting code:", error);
    }
  };

  const handleAssignCode = async (id: string, code: string) => {
    try {
      const res = await fetch('/api/admin/assign-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, code, message: `Votre code de présence est ${code}.` })
      });
      if (res.ok) {
        setAssigningCode(null);
        fetchData();
        toast.success('Code assigné avec succès !');
      }
    } catch (error) {
      console.error("Error assigning code:", error);
      toast.error('Erreur lors de l\'assignation du code.');
    }
  };

  const generatePoster = async () => {
    if (!posterPrompt) return;
    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [{ text: `Create a professional student club event poster for: ${posterPrompt}. The style should be modern and energetic.` }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: posterSize
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error) {
      console.error("Error generating poster:", error);
      if (error instanceof Error && error.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const sendMessage = async () => {
    if (!userInput.trim()) return;

    const newMessages = [...chatMessages, { role: 'user' as const, text: userInput }];
    setChatMessages(newMessages);
    setUserInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are CampusClub Assistant, a helpful AI for a student club. You help members with event info, club policies, and general student life advice. Be friendly, encouraging, and professional.",
        },
      });

      // Send history + new message
      const response = await chat.sendMessage({ message: userInput });
      setChatMessages([...newMessages, { role: 'model', text: response.text || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages([...newMessages, { role: 'model', text: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'ADMIN123') {
      setIsAdminAuthenticated(true);
      setAppMode('admin');
      setActiveTab('dashboard');
    } else {
      alert('Invalid Admin Code');
    }
  };

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberLoginId.trim()) return;
    setIsMemberLoggingIn(true);
    try {
      const res = await fetch(`/api/members/${memberLoginId.toUpperCase()}`);
      if (res.ok) {
        const member = await res.json();
        setCurrentMember(member);
        setAppMode('member');
        setActiveTab('dashboard');
      } else {
        alert('ID Membre non trouvé. Veuillez vous inscrire si vous ne l\'avez pas encore fait.');
      }
    } catch (error) {
      console.error("Error logging in member:", error);
    } finally {
      setIsMemberLoggingIn(false);
    }
  };

  const handleMemberCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presenceCode) {
      setMemberCheckInError('Veuillez entrer votre code de présence');
      return;
    }

    if (!selectedEventId) {
      setMemberCheckInError('Veuillez sélectionner un événement');
      return;
    }

    setCheckInStatus('loading');
    setMemberCheckInError('');
    
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceCode, eventId: selectedEventId })
      });
      
      if (res.ok) {
        setCheckInStatus('success');
        setPresenceCode('');
        setSelectedEventId('');
        fetchData();
        setTimeout(() => setCheckInStatus('idle'), 3000);
      } else {
        const data = await res.json();
        setCheckInStatus('error');
        setMemberCheckInError(data.error || 'Erreur lors du pointage. Vérifiez votre code.');
      }
    } catch (error) {
      setCheckInStatus('error');
      setMemberCheckInError('Erreur de connexion.');
    }
  };

  const handleMemberRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, id } = memberForm;
    if (!name || !email || !id) {
      setMemberCheckInError('Tous les champs sont requis.');
      return;
    }

    const etuRegex = /^ETU\d{4}$/;
    if (!etuRegex.test(id)) {
      setMemberCheckInError('Format ID invalide. Utilisez ETUXXXX (ex: ETU4386)');
      return;
    }

    setIsRegistering(true);
    setMemberCheckInError('');
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email, 
          role: 'Volunteer',
          id 
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setLastPresenceCode(data.member.presenceCode);
        setMemberForm({ id: '', name: '', email: '', role: 'Volunteer', presenceCode: '' });
        fetchData();
      } else {
        const data = await res.json();
        setMemberCheckInError(data.error || 'Erreur lors de l\'inscription.');
      }
    } catch (error) {
      setMemberCheckInError('Erreur de connexion.');
    } finally {
      setIsRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Selection Screen
  if (appMode === 'selection') {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 font-sans">
        <Toaster position="top-right" richColors />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          {/* Admin Card */}
          <div className="bg-white p-10 rounded-[2.5rem] border border-neutral-200 shadow-2xl shadow-neutral-200/50 space-y-8 flex flex-col items-center text-center group hover:border-neutral-900 transition-all">
            <div className="w-20 h-20 bg-neutral-900 rounded-3xl flex items-center justify-center rotate-3 group-hover:rotate-6 transition-transform">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Administrateur</h2>
              <p className="text-neutral-500 text-sm">Gérez les membres, les événements et les présences.</p>
            </div>
            <form onSubmit={handleAdminLogin} className="w-full space-y-4">
              <input 
                type="password" 
                placeholder="Code Admin" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all text-center font-mono tracking-widest"
              />
              <button className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-neutral-200">
                Accéder au Panel
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Member Card */}
          <div className="bg-white p-10 rounded-[2.5rem] border border-neutral-200 shadow-2xl shadow-neutral-200/50 space-y-8 flex flex-col items-center text-center group hover:border-amber-500 transition-all">
            <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center -rotate-3 group-hover:-rotate-6 transition-transform">
              <Users className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Membre</h2>
              <p className="text-neutral-500 text-sm">Pointez votre présence et consultez les événements.</p>
            </div>
            <form onSubmit={handleMemberLogin} className="w-full space-y-4">
              <input 
                type="text" 
                placeholder="ID Étudiant (ETUXXXX)" 
                value={memberLoginId}
                onChange={(e) => setMemberLoginId(e.target.value.toUpperCase())}
                className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-center font-mono tracking-widest"
              />
              <button 
                disabled={isMemberLoggingIn}
                className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-100 disabled:opacity-50"
              >
                {isMemberLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : "Se Connecter"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
            <div className="pt-4 border-t border-neutral-100 w-full">
              <button 
                onClick={() => {
                  setAppMode('member');
                  setMemberSubMode('register');
                }}
                className="text-amber-600 font-bold text-sm hover:underline"
              >
                Pas encore de compte ? S'inscrire
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Member Login / Register Screen (if not logged in)
  if (appMode === 'member' && !currentMember) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 font-sans">
        <Toaster position="top-right" richColors />
        <button 
          onClick={() => setAppMode('selection')}
          className="absolute top-6 left-6 p-2 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8"
        >
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Espace Membre</h1>
            <p className="text-neutral-500">
              {memberSubMode === 'register' ? 'Créez votre profil de bénévole' : 'Connectez-vous à votre espace'}
            </p>
          </div>

          {memberSubMode === 'register' ? (
            <form onSubmit={handleRegisterMember} className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-xl space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Nom Complet</label>
                <input 
                  type="text"
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({...memberForm, name: e.target.value})}
                  placeholder="ex: Jean Dupont"
                  className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Email</label>
                <input 
                  type="email"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({...memberForm, email: e.target.value})}
                  placeholder="ex: jean@univ.fr"
                  className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">ID Étudiant (ETUXXXX)</label>
                <input 
                  type="text"
                  value={memberForm.id}
                  onChange={(e) => setMemberForm({...memberForm, id: e.target.value.toUpperCase()})}
                  placeholder="ex: ETU4386"
                  className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-center text-xl font-mono"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={isRegistering}
                className="w-full py-4 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-amber-100"
              >
                {isRegistering ? <Loader2 className="w-5 h-5 animate-spin" /> : "Créer mon profil"}
              </button>

              <button 
                type="button"
                onClick={() => setMemberSubMode('check-in')}
                className="w-full text-center text-sm text-neutral-500 hover:underline"
              >
                Déjà inscrit ? Se connecter
              </button>
            </form>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-xl space-y-6 text-center">
              <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto">
                <Users className="w-10 h-10 text-white" />
              </div>
              <form onSubmit={handleMemberLogin} className="space-y-4">
                <input 
                  type="text" 
                  placeholder="ID Étudiant (ETUXXXX)" 
                  value={memberLoginId}
                  onChange={(e) => setMemberLoginId(e.target.value.toUpperCase())}
                  className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-center font-mono tracking-widest"
                />
                <button 
                  disabled={isMemberLoggingIn}
                  className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-100 disabled:opacity-50"
                >
                  {isMemberLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : "Se Connecter"}
                </button>
              </form>
              <button 
                onClick={() => setMemberSubMode('register')}
                className="text-amber-600 font-bold text-sm hover:underline"
              >
                Créer un compte
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <Toaster position="top-right" richColors />
      {/* Sidebar / Navigation */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 md:top-0 md:bottom-auto md:h-screen md:w-64 bg-white border-t md:border-t-0 md:border-r border-neutral-200 z-50",
        appMode === 'member' && "border-amber-100"
      )}>
        <div className="flex md:flex-col h-full p-4">
          <div className="hidden md:flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                appMode === 'admin' ? "bg-neutral-900" : "bg-amber-500"
              )}>
                <Users className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">
                {appMode === 'admin' ? "Admin Panel" : "Espace Membre"}
              </span>
            </div>
            <button 
              onClick={() => {
                setAppMode('selection');
                setIsAdminAuthenticated(false);
                setAdminPassword('');
                setCurrentMember(null);
                setMemberLoginId('');
              }}
              className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-neutral-900 transition-colors"
              title="Quitter"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex md:flex-col flex-1 justify-around md:justify-start gap-2">
            {appMode === 'admin' ? (
              <>
                <NavButton 
                  active={activeTab === 'dashboard'} 
                  onClick={() => setActiveTab('dashboard')}
                  icon={<LayoutDashboard className="w-5 h-5" />}
                  label="Dashboard"
                />
                <NavButton 
                  active={activeTab === 'events'} 
                  onClick={() => setActiveTab('events')}
                  icon={<Calendar className="w-5 h-5" />}
                  label="Événements"
                />
                <NavButton 
                  active={activeTab === 'members'} 
                  onClick={() => setActiveTab('members')}
                  icon={<Users className="w-5 h-5" />}
                  label="Membres"
                />
                <NavButton 
                  active={activeTab === 'poster'} 
                  onClick={() => setActiveTab('poster')}
                  icon={<ImagePlus className="w-5 h-5" />}
                  label="Poster Lab"
                />
                <NavButton 
                  active={activeTab === 'chat'} 
                  onClick={() => setActiveTab('chat')}
                  icon={<MessageSquare className="w-5 h-5" />}
                  label="Assistant AI"
                />
              </>
            ) : (
              <>
                <NavButton 
                  active={activeTab === 'dashboard'} 
                  onClick={() => setActiveTab('dashboard')}
                  icon={<LayoutDashboard className="w-5 h-5" />}
                  label="Accueil"
                  variant="amber"
                />
                <NavButton 
                  active={activeTab === 'check-in'} 
                  onClick={() => setActiveTab('check-in')}
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  label="Pointeur"
                  variant="amber"
                />
                <NavButton 
                  active={activeTab === 'attendance'} 
                  onClick={() => setActiveTab('attendance')}
                  icon={<ListChecks className="w-5 h-5" />}
                  label="Présents"
                  variant="amber"
                />
                <NavButton 
                  active={activeTab === 'profile'} 
                  onClick={() => setActiveTab('profile')}
                  icon={<UserCircle className="w-5 h-5" />}
                  label="Mon Profil"
                  variant="amber"
                />
                <NavButton 
                  active={activeTab === 'chat'} 
                  onClick={() => setActiveTab('chat')}
                  icon={<MessageSquare className="w-5 h-5" />}
                  label="Assistant AI"
                  variant="amber"
                />
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-64 p-6 pb-24 md:pb-6">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                      {appMode === 'admin' ? 'Welcome back, Club!' : `Bonjour, ${currentMember?.name}!`}
                    </h1>
                    <p className="text-neutral-500 mt-1">
                      {appMode === 'admin' ? "Here's what's happening in your community." : "Ravi de vous revoir parmi nous."}
                    </p>
                  </div>
                  {appMode === 'member' && (
                    <div className="flex items-center gap-3 bg-amber-50 px-4 py-2 rounded-2xl border border-amber-100">
                      <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {currentMember?.id.slice(-2)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-amber-900">{currentMember?.id}</p>
                        <p className="text-[10px] text-amber-600 uppercase tracking-widest font-bold">{currentMember?.role}</p>
                      </div>
                    </div>
                  )}
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <section className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm md:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-semibold flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-neutral-400" />
                        {appMode === 'admin' ? 'Upcoming Events' : 'Événements à venir'}
                      </h2>
                      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{events.length} Total</span>
                    </div>
                    <div className="space-y-4">
                      {events.map(event => (
                        <div key={event.id} className="flex items-start gap-4 p-3 hover:bg-neutral-50 rounded-xl transition-colors cursor-pointer group">
                          <div className="w-12 h-12 bg-neutral-100 rounded-lg flex flex-col items-center justify-center text-neutral-600">
                            <span className="text-[10px] font-bold uppercase">{format(new Date(event.date), 'MMM')}</span>
                            <span className="text-lg font-bold leading-none">{format(new Date(event.date), 'dd')}</span>
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium group-hover:text-neutral-900 transition-colors">{event.title}</h3>
                            <p className="text-sm text-neutral-500 line-clamp-1">{event.description}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-400" />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-6">
                    {appMode === 'admin' ? (
                      <div className="bg-neutral-900 p-6 rounded-2xl text-white shadow-lg">
                        <h2 className="font-bold mb-2 flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          Quick Actions
                        </h2>
                        <p className="text-xs text-white/50 mb-4">Manage your club volunteers efficiently.</p>
                        <button 
                          onClick={() => setActiveTab('members')}
                          className="w-full py-3 bg-white text-neutral-900 rounded-xl text-sm font-bold hover:bg-neutral-100 transition-all"
                        >
                          Register New Member
                        </button>
                      </div>
                    ) : (
                      <div className="bg-amber-500 p-6 rounded-2xl text-white shadow-lg shadow-amber-100">
                        <h2 className="font-bold mb-2 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          Ma Présence
                        </h2>
                        <p className="text-xs text-white/80 mb-4">Marquez votre présence à l'événement du jour.</p>
                        <button 
                          onClick={() => setActiveTab('check-in')}
                          className="w-full py-3 bg-white text-amber-600 rounded-xl text-sm font-bold hover:bg-amber-50 transition-all"
                        >
                          Aller au Pointeur
                        </button>
                      </div>
                    )}

                    <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold flex items-center gap-2">
                          <Users className="w-4 h-4 text-neutral-400" />
                          {appMode === 'admin' ? 'Recent Attendance' : 'Dernières Présences'}
                        </h2>
                        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{attendance.length} Records</span>
                      </div>
                      <div className="space-y-4">
                        {attendance.slice(0, 3).map(record => (
                          <div key={record.id} className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                              appMode === 'admin' ? "bg-neutral-900" : "bg-amber-500"
                            )}>
                              {record.studentName.charAt(0)}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium flex items-center gap-2">
                                {record.studentName}
                                {record.verified ? (
                                  <ShieldCheck className="w-3 h-3 text-green-500" />
                                ) : (
                                  <ShieldAlert className="w-3 h-3 text-amber-500" />
                                )}
                              </p>
                              <p className="text-xs text-neutral-500">{format(new Date(record.timestamp), 'h:mm a')}</p>
                            </div>
                          </div>
                        ))}
                        {attendance.length === 0 && (
                          <div className="text-center py-4 text-neutral-400">
                            <p className="text-xs">No records yet.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {appMode === 'admin' && (
                      <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="font-semibold flex items-center gap-2 text-amber-900">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            Code Requests
                          </h2>
                          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                            {members.filter(m => m.codeRequested).length} Pending
                          </span>
                        </div>
                        <div className="space-y-3">
                          {members.filter(m => m.codeRequested).slice(0, 3).map(member => (
                            <div key={member.id} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-amber-100">
                              <div>
                                <p className="text-sm font-bold text-amber-900">{member.name}</p>
                                <p className="text-[10px] text-amber-600">{member.id}</p>
                              </div>
                              <button 
                                onClick={() => {
                                  setActiveTab('members');
                                  setMemberSearch(member.id);
                                }}
                                className="px-3 py-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-all"
                              >
                                Assign
                              </button>
                            </div>
                          ))}
                          {members.filter(m => m.codeRequested).length === 0 && (
                            <p className="text-center text-xs text-amber-600 italic py-2">No pending requests.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'poster' && (
              <motion.div
                key="poster"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header>
                  <h1 className="text-3xl font-bold tracking-tight">Poster Lab</h1>
                  <p className="text-neutral-500 mt-1">Generate stunning visuals for your club events using AI.</p>
                </header>

                {!hasApiKey ? (
                  <div className="bg-white p-12 rounded-3xl border border-dashed border-neutral-300 text-center space-y-4">
                    <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto">
                      <AlertCircle className="w-8 h-8 text-neutral-400" />
                    </div>
                    <div className="max-w-sm mx-auto">
                      <h2 className="text-xl font-bold">API Key Required</h2>
                      <p className="text-neutral-500 mt-2 text-sm">
                        To use high-quality image generation, you need to select a paid Gemini API key.
                      </p>
                      <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-xs text-neutral-400 underline mt-1 block">Learn about billing</a>
                    </div>
                    <button 
                      onClick={handleOpenKeyDialog}
                      className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all"
                    >
                      Select API Key
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-6">
                      <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Event Description</label>
                          <textarea 
                            value={posterPrompt}
                            onChange={(e) => setPosterPrompt(e.target.value)}
                            placeholder="e.g. A futuristic hackathon poster with neon lights and digital circuits..."
                            className="w-full h-32 p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all resize-none text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Resolution</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(['1K', '2K', '4K'] as const).map(size => (
                              <button
                                key={size}
                                onClick={() => setPosterSize(size)}
                                className={cn(
                                  "py-2 text-xs font-bold rounded-lg border transition-all",
                                  posterSize === size 
                                    ? "bg-neutral-900 border-neutral-900 text-white" 
                                    : "bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300"
                                )}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={generatePoster}
                          disabled={isGenerating || !posterPrompt}
                          className="w-full py-4 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <Sparkles className="w-5 h-5" />
                              Generate Poster
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden aspect-square flex items-center justify-center relative group">
                        {generatedImage ? (
                          <>
                            <img src={generatedImage} alt="Generated Poster" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <button 
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = generatedImage;
                                  link.download = 'club-poster.png';
                                  link.click();
                                }}
                                className="p-3 bg-white rounded-full text-neutral-900 hover:scale-110 transition-transform"
                              >
                                <Download className="w-6 h-6" />
                              </button>
                            </div>
                          </>
                        ) : isGenerating ? (
                          <div className="text-center space-y-4">
                            <Loader2 className="w-12 h-12 animate-spin text-neutral-200 mx-auto" />
                            <p className="text-neutral-400 font-medium animate-pulse">Creating your masterpiece...</p>
                          </div>
                        ) : (
                          <div className="text-center space-y-4 p-12">
                            <ImageIcon className="w-16 h-16 text-neutral-100 mx-auto" />
                            <p className="text-neutral-400 max-w-xs">Enter a description and click generate to see your poster here.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-[calc(100vh-12rem)] flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden"
              >
                <header className="p-4 border-bottom border-neutral-100 flex items-center gap-3 bg-neutral-50/50">
                  <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold">Club Assistant</h2>
                    <p className="text-[10px] text-green-600 font-bold uppercase tracking-widest flex items-center gap-1">
                      <span className="w-1 h-1 bg-green-600 rounded-full animate-pulse" />
                      Online
                    </p>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                      <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-neutral-400" />
                      </div>
                      <div className="max-w-xs">
                        <p className="font-medium">How can I help you today?</p>
                        <p className="text-sm">Ask about events, membership, or club policies.</p>
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex gap-4 max-w-[85%]",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold",
                        msg.role === 'user' ? "bg-neutral-100 text-neutral-600" : "bg-neutral-900 text-white"
                      )}>
                        {msg.role === 'user' ? 'U' : 'A'}
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-neutral-100 text-neutral-800 rounded-tr-none" 
                          : "bg-white border border-neutral-100 shadow-sm rounded-tl-none"
                      )}>
                        <div className="prose prose-sm max-w-none prose-neutral">
                          <Markdown>
                            {msg.text}
                          </Markdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-4 max-w-[85%]">
                      <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center text-white">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm rounded-tl-none flex gap-1">
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-neutral-50/50 border-t border-neutral-100">
                  <div className="relative">
                    <input 
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type your message..."
                      className="w-full p-4 pr-12 bg-white border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all shadow-sm"
                    />
                    <button 
                      onClick={sendMessage}
                      disabled={!userInput.trim() || isTyping}
                      className="absolute right-2 top-2 bottom-2 px-4 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-all disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'reunion' && (
              <motion.div
                key="reunion"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Reunion Checklist</h1>
                    <p className="text-neutral-500 mt-1">Manage attendance for the Club of Volunteers.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-neutral-200 shadow-sm">
                    <div className="px-4 py-2 bg-neutral-100 rounded-xl">
                      <span className="text-xs font-bold text-neutral-400 uppercase block">Present</span>
                      <span className="text-xl font-bold">
                        {attendance.filter(r => r.eventId === reunionEventId).length}
                      </span>
                    </div>
                    <div className="px-4 py-2">
                      <span className="text-xs font-bold text-neutral-400 uppercase block">Total</span>
                      <span className="text-xl font-bold text-neutral-400">{members.length}</span>
                    </div>
                  </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Select Event</label>
                        <select 
                          value={reunionEventId}
                          onChange={(e) => setReunionEventId(e.target.value)}
                          className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                        >
                          <option value="">Choose event...</option>
                          {events.map(event => (
                            <option key={event.id} value={event.id}>{event.title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Search Members</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input 
                            type="text"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Name or ID..."
                            className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                      <div className="max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white border-b border-neutral-100 z-10">
                            <tr>
                              <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Member</th>
                              <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-center">Status</th>
                              <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50">
                            {members
                              .filter(m => 
                                m.name.toLowerCase().includes(memberSearch.toLowerCase()) || 
                                m.id.toLowerCase().includes(memberSearch.toLowerCase())
                              )
                              .map(member => {
                                const isPresent = attendance.some(r => r.studentId === member.id && r.eventId === reunionEventId);
                                return (
                                  <tr key={member.id} className="hover:bg-neutral-50 transition-colors group">
                                    <td className="p-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center text-xs font-bold text-neutral-600">
                                          {member.name.charAt(0)}
                                        </div>
                                        <div>
                                          <p className="font-medium text-sm">{member.name}</p>
                                          <p className="text-xs text-neutral-400">{member.id}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-4 text-center">
                                      <button 
                                        disabled={!reunionEventId}
                                        onClick={() => togglePresence(member.id)}
                                        className={cn(
                                          "w-8 h-8 rounded-full flex items-center justify-center transition-all mx-auto",
                                          isPresent 
                                            ? "bg-green-500 text-white shadow-lg shadow-green-100" 
                                            : "bg-neutral-100 text-neutral-300 hover:bg-neutral-200"
                                        )}
                                      >
                                        {isPresent ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                      </button>
                                    </td>
                                    <td className="p-4 text-right">
                                      {member.codeRequested ? (
                                        <div className="flex flex-col items-end gap-2">
                                          {assigningCode?.id === member.id ? (
                                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                                              <input 
                                                type="text"
                                                value={assigningCode.code}
                                                onChange={(e) => setAssigningCode({ ...assigningCode, code: e.target.value })}
                                                placeholder="Code"
                                                className="w-16 p-1 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-neutral-900 outline-none"
                                                autoFocus
                                              />
                                              <button 
                                                onClick={() => handleAssignCode(member.id, assigningCode.code)}
                                                className="p-1 bg-neutral-900 text-white rounded hover:bg-neutral-800"
                                              >
                                                <Check className="w-3 h-3" />
                                              </button>
                                              <button 
                                                onClick={() => setAssigningCode(null)}
                                                className="p-1 bg-neutral-100 text-neutral-400 rounded hover:bg-neutral-200"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ) : (
                                            <button 
                                              onClick={() => setAssigningCode({ id: member.id, code: '' })}
                                              className="px-3 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-all flex items-center gap-1 animate-pulse"
                                            >
                                              <Plus className="w-3 h-3" />
                                              Assign Code
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-end">
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Code</span>
                                          <span className="font-mono text-sm font-bold text-neutral-900">{member.presenceCode || '---'}</span>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'events' && (
              <motion.div
                key="events"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Événements</h1>
                    <p className="text-neutral-500 mt-1">
                      {appMode === 'admin' ? "Gérez les activités et réunions du club." : "Découvrez les prochaines activités du club."}
                    </p>
                  </div>
                  {appMode === 'admin' && (
                    <button 
                      onClick={() => {
                        setEditingEventId(null);
                        setEventForm({ title: '', date: '', description: '' });
                      }}
                      className="p-3 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {appMode === 'admin' && (
                    <div className="lg:col-span-1">
                      <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-6 sticky top-6">
                        <h2 className="font-bold flex items-center gap-2">
                          {editingEventId ? <Edit2 className="w-4 h-4 text-amber-500" /> : <Plus className="w-4 h-4 text-amber-500" />}
                          {editingEventId ? 'Modifier l\'événement' : 'Nouvel événement'}
                        </h2>
                        
                        <form onSubmit={editingEventId ? handleUpdateEvent : handleCreateEvent} className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Titre</label>
                            <input 
                              type="text"
                              value={eventForm.title}
                              onChange={(e) => setEventForm({...eventForm, title: e.target.value})}
                              placeholder="Réunion hebdomadaire"
                              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Date</label>
                            <input 
                              type="datetime-local"
                              value={eventForm.date}
                              onChange={(e) => setEventForm({...eventForm, date: e.target.value})}
                              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Description</label>
                            <textarea 
                              value={eventForm.description}
                              onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                              placeholder="Détails de l'événement..."
                              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all min-h-[100px]"
                            />
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button 
                              type="submit"
                              className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-100"
                            >
                              {editingEventId ? 'Mettre à jour' : 'Créer'}
                            </button>
                            {editingEventId && (
                              <button 
                                type="button"
                                onClick={() => {
                                  setEditingEventId(null);
                                  setEventForm({ title: '', date: '', description: '' });
                                }}
                                className="px-4 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                              >
                                Annuler
                              </button>
                            )}
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  <div className={cn("space-y-4", appMode === 'admin' ? "lg:col-span-2" : "lg:col-span-3")}>
                    {events.length === 0 ? (
                      <div className="bg-white p-12 rounded-3xl border border-dashed border-neutral-200 text-center space-y-4">
                        <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto text-neutral-300">
                          <Calendar className="w-8 h-8" />
                        </div>
                        <p className="text-neutral-500 font-medium">Aucun événement prévu pour le moment.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {events.map(event => (
                          <div key={event.id} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1 h-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-all" />
                            <div className="flex justify-between items-start mb-4">
                              <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                                <Calendar className="w-5 h-5" />
                              </div>
                              {appMode === 'admin' && (
                                <div className="flex gap-1">
                                  <button 
                                    onClick={() => {
                                      setEditingEventId(event.id);
                                      setEventForm({
                                        title: event.title,
                                        date: format(new Date(event.date), "yyyy-MM-dd'T'HH:mm"),
                                        description: event.description
                                      });
                                    }}
                                    className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-all"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteEvent(event.id)}
                                    className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <h3 className="font-bold text-lg mb-1">{event.title}</h3>
                            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
                              {format(new Date(event.date), 'EEEE d MMMM yyyy', { locale: fr })}
                            </p>
                            <p className="text-sm text-neutral-600 line-clamp-2">{event.description}</p>
                            
                            <div className="mt-6 pt-4 border-t border-neutral-50 flex items-center justify-between">
                              <div className="flex -space-x-2">
                                {[1, 2, 3].map(i => (
                                  <div key={i} className="w-6 h-6 rounded-full bg-neutral-100 border-2 border-white flex items-center justify-center text-[8px] font-bold">
                                    {String.fromCharCode(64 + i)}
                                  </div>
                                ))}
                                <div className="w-6 h-6 rounded-full bg-neutral-50 border-2 border-white flex items-center justify-center text-[8px] font-bold text-neutral-400">
                                  +{Math.floor(Math.random() * 20)}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                {attendance.filter(a => a.eventId === event.id).length} Présents
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'members' && appMode === 'admin' && (
              <motion.div
                key="members"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header>
                  <h1 className="text-3xl font-bold tracking-tight">Member Management</h1>
                  <p className="text-neutral-500 mt-1">Register and manage the Club of Volunteers.</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
                      <h2 className="font-bold flex items-center gap-2">
                        {editingMemberId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {editingMemberId ? 'Modifier le Membre' : 'Ajouter un Membre'}
                      </h2>
                      
                      <form onSubmit={editingMemberId ? handleUpdateMember : handleRegisterMember} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Nom Complet</label>
                          <input 
                            type="text"
                            value={memberForm.name}
                            onChange={(e) => setMemberForm({...memberForm, name: e.target.value})}
                            placeholder="John Doe"
                            className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Email</label>
                          <input 
                            type="email"
                            value={memberForm.email}
                            onChange={(e) => setMemberForm({...memberForm, email: e.target.value})}
                            placeholder="john@example.com"
                            className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                            required
                          />
                        </div>

                        {!editingMemberId && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">ID Étudiant (ETUXXXX)</label>
                            <input 
                              type="text"
                              value={memberForm.id}
                              onChange={(e) => setMemberForm({...memberForm, id: e.target.value.toUpperCase()})}
                              placeholder="ETU4386"
                              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                              required
                            />
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Rôle</label>
                          <select 
                            value={memberForm.role}
                            onChange={(e) => setMemberForm({...memberForm, role: e.target.value})}
                            className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                          >
                            <option value="Volunteer">Volunteer</option>
                            <option value="Lead">Lead</option>
                            <option value="Admin">Admin</option>
                          </select>
                        </div>

                        {editingMemberId && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Code de Présence</label>
                            <input 
                              type="text"
                              value={memberForm.presenceCode || ''}
                              onChange={(e) => setMemberForm({...memberForm, presenceCode: e.target.value})}
                              placeholder="ex: 123456"
                              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                            />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button 
                            type="submit"
                            disabled={isRegistering}
                            className="flex-1 py-4 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingMemberId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                            {editingMemberId ? 'Mettre à jour' : 'Enregistrer'}
                          </button>
                          {editingMemberId && (
                            <button 
                              type="button"
                              onClick={() => {
                                setEditingMemberId(null);
                                setMemberForm({ id: '', name: '', email: '', role: 'Volunteer', presenceCode: '' });
                              }}
                              className="px-4 py-4 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-8">
                    {/* Code Requests Section */}
                    {members.some(m => m.codeRequested) && (
                      <div className="bg-amber-50 rounded-3xl border border-amber-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4">
                        <div className="p-4 border-b border-amber-200 flex items-center justify-between bg-amber-100/50">
                          <h2 className="font-bold flex items-center gap-2 text-amber-800">
                            <Plus className="w-4 h-4" />
                            Demandes de codes
                          </h2>
                          <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            {members.filter(m => m.codeRequested).length} En attente
                          </span>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {members.filter(m => m.codeRequested).map(member => (
                            <div key={member.id} className="p-4 bg-white rounded-2xl border border-amber-100 flex items-center justify-between gap-4 shadow-sm">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-xs font-bold text-amber-700">
                                  {member.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-sm text-amber-900">{member.name}</p>
                                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{member.id}</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {assigningCode?.id === member.id ? (
                                  <div className="flex items-center gap-2">
                                    <input 
                                      type="text"
                                      value={assigningCode.code}
                                      onChange={(e) => setAssigningCode({ ...assigningCode, code: e.target.value })}
                                      placeholder="Code"
                                      className="w-20 p-2 text-xs border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                      autoFocus
                                    />
                                    <button 
                                      onClick={() => handleAssignCode(member.id, assigningCode.code)}
                                      className="p-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-all"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => setAssigningCode(null)}
                                      className="p-2 bg-neutral-100 text-neutral-400 rounded-xl hover:bg-neutral-200 transition-all"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setAssigningCode({ id: member.id, code: '' })}
                                    className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-all shadow-sm"
                                  >
                                    Assigner
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
                        <h2 className="font-bold">Member List</h2>
                        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{members.length} Total</span>
                      </div>
                      <div className="max-h-[600px] overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                          {members.map(member => (
                            <div key={member.id} className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-xs font-bold text-neutral-900 border border-neutral-200">
                                {member.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate">{member.name}</p>
                                <p className="text-xs text-neutral-500 truncate">{member.email}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => {
                                      setEditingMemberId(member.id);
                                      setMemberForm({
                                        id: member.id,
                                        name: member.name,
                                        email: member.email,
                                        role: member.role,
                                        presenceCode: member.presenceCode || ''
                                      });
                                    }}
                                    className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-white rounded-lg transition-all"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteMember(member.id)}
                                    className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-[10px] font-bold bg-white px-2 py-1 rounded-md border border-neutral-200 text-neutral-400">
                                  {member.id}
                                </div>
                                <div className="text-[10px] font-bold bg-neutral-900 px-2 py-1 rounded-md text-white">
                                  Code: {member.presenceCode || '---'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'check-in' && appMode === 'member' && (
              <motion.div
                key="check-in"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header>
                  <h1 className="text-3xl font-bold tracking-tight">Pointeur de Présence</h1>
                  <p className="text-neutral-500 mt-1">Marquez votre présence aux événements du club.</p>
                </header>

                <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-neutral-200 shadow-xl shadow-amber-50 space-y-8">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
                      <QrCode className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold">Vérification de Présence</h2>
                    <p className="text-sm text-neutral-500">Entrez votre code personnel pour valider votre présence.</p>
                  </div>

                  <form onSubmit={handleMemberCheckIn} className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Événement Actuel</label>
                        <select 
                          value={selectedEventId}
                          onChange={(e) => setSelectedEventId(e.target.value)}
                          className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-medium"
                          required
                        >
                          <option value="">Sélectionner un événement</option>
                          {events.map(event => (
                            <option key={event.id} value={event.id}>{event.title} - {new Date(event.date).toLocaleDateString()}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Votre Code de Présence</label>
                        <input 
                          type="text"
                          value={presenceCode}
                          onChange={(e) => setPresenceCode(e.target.value)}
                          placeholder="Ex: 123456"
                          className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-center text-2xl font-bold tracking-[0.5em]"
                          maxLength={6}
                          required
                        />
                      </div>
                    </div>

                    {memberCheckInError && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {memberCheckInError}
                      </div>
                    )}

                    {checkInStatus === 'success' && (
                      <div className="p-4 bg-green-50 border border-green-100 rounded-2xl text-green-600 text-sm font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Présence validée avec succès !
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={checkInStatus === 'loading'}
                      className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {checkInStatus === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      Valider ma présence
                    </button>
                  </form>

                  <div className="pt-4 border-t border-neutral-100 text-center">
                    <p className="text-xs text-neutral-400">
                      Vous n'avez pas de code ? <button onClick={() => handleRequestCode(currentMember?.id || '')} className="text-amber-600 font-bold hover:underline">Demander à l'admin</button>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'attendance' && appMode === 'member' && (
              <motion.div
                key="attendance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header>
                  <h1 className="text-3xl font-bold tracking-tight">Membres Présents</h1>
                  <p className="text-neutral-500 mt-1">Liste des membres ayant validé leur présence aujourd'hui.</p>
                </header>

                <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                    <h2 className="font-bold flex items-center gap-2">
                      <Users className="w-5 h-5 text-amber-500" />
                      Présences validées
                    </h2>
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                      {attendance.length} Présents
                    </span>
                  </div>
                  
                  <div className="p-6">
                    {attendance.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto text-neutral-300">
                          <Users className="w-8 h-8" />
                        </div>
                        <p className="text-neutral-500 font-medium">Aucune présence enregistrée pour le moment.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {attendance.map((presence, idx) => {
                          const member = members.find(m => m.id === presence.studentId);
                          const event = events.find(e => e.id === presence.eventId);
                          return (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.05 }}
                              key={`${presence.studentId}-${presence.eventId}`}
                              className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center gap-4"
                            >
                              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-lg font-bold text-amber-600 border border-amber-100 shadow-sm">
                                {member?.name.charAt(0) || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate">{member?.name || 'Inconnu'}</p>
                                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider truncate">
                                  {event?.title || 'Événement'}
                                </p>
                                <p className="text-[10px] text-amber-600 font-medium mt-1">
                                  {new Date(presence.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'profile' && appMode === 'member' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <header>
                  <h1 className="text-3xl font-bold tracking-tight">Mon Profil</h1>
                  <p className="text-neutral-500 mt-1">Gérez vos informations personnelles et votre code de présence.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1 space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm text-center space-y-4">
                      <div className="relative inline-block">
                        <div className="w-24 h-24 bg-amber-500 rounded-3xl flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-amber-100 mx-auto">
                          {currentMember?.name.charAt(0)}
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-xl border border-neutral-200 flex items-center justify-center text-neutral-400 shadow-sm">
                          <Camera className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">{currentMember?.name}</h2>
                        <p className="text-sm text-neutral-500">{currentMember?.email}</p>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                          {currentMember?.role}
                        </span>
                        <span className="px-3 py-1 bg-neutral-100 text-neutral-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
                          {currentMember?.id}
                        </span>
                      </div>
                    </div>

                    <div className="bg-amber-900 text-white p-6 rounded-3xl space-y-4 shadow-xl shadow-amber-100">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm">Code de Présence</h3>
                        <ShieldCheck className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="bg-amber-800/50 p-4 rounded-2xl text-center">
                        <span className="text-3xl font-mono font-bold tracking-[0.3em]">
                          {currentMember?.presenceCode || '------'}
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-300 leading-relaxed">
                        Ce code est confidentiel. Utilisez-le pour valider votre présence lors des événements du club.
                      </p>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
                      <h3 className="font-bold flex items-center gap-2">
                        <Settings className="w-5 h-5 text-neutral-400" />
                        Paramètres du compte
                      </h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Nom Complet</label>
                          <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-neutral-900 font-medium">
                            {currentMember?.name}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Email</label>
                          <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-neutral-900 font-medium">
                            {currentMember?.email}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">ID Étudiant</label>
                          <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-neutral-900 font-medium">
                            {currentMember?.id}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400">Date d'adhésion</label>
                          <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-neutral-900 font-medium">
                            {new Date().toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-neutral-100 flex justify-end">
                        <button className="px-6 py-3 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all flex items-center gap-2">
                          <Edit2 className="w-4 h-4" />
                          Modifier mes infos
                        </button>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
                      <h3 className="font-bold flex items-center gap-2">
                        <Activity className="w-5 h-5 text-neutral-400" />
                        Statistiques de présence
                      </h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-6 bg-green-50 rounded-3xl border border-green-100 text-center">
                          <p className="text-2xl font-bold text-green-700">{attendance.filter(p => p.studentId === currentMember?.id).length}</p>
                          <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mt-1">Total Présences</p>
                        </div>
                        <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 text-center">
                          <p className="text-2xl font-bold text-amber-700">{events.length}</p>
                          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">Événements Club</p>
                        </div>
                        <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 text-center">
                          <p className="text-2xl font-bold text-blue-700">
                            {events.length > 0 ? Math.round((attendance.filter(p => p.studentId === currentMember?.id).length / events.length) * 100) : 0}%
                          </p>
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">Taux de Participation</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, variant = 'neutral' }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, variant?: 'neutral' | 'amber' }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm relative",
        active 
          ? (variant === 'amber' ? "bg-amber-500 text-white shadow-lg shadow-amber-100" : "bg-neutral-900 text-white shadow-lg shadow-neutral-200")
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      )}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
      {active && (
        <motion.div 
          layoutId="active-pill"
          className="md:hidden absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full"
        />
      )}
    </button>
  );
}
