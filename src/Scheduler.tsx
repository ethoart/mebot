import React, { useState, useEffect } from 'react';
import { CalendarClock, Trash2, CheckCircle2, Clock, MessageSquare, Power, Search } from 'lucide-react';

export default function Scheduler({ status }: { status: any }) {
    const [schedules, setSchedules] = useState<any[]>([]);
    const [chats, setChats] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [selectedChat, setSelectedChat] = useState<any>(null);
    const [message, setMessage] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [loading, setLoading] = useState(false);

    const loadSchedules = async () => {
        try {
            const res = await fetch("/api/whatsapp/schedules");
            const data = await res.json();
            setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
        } catch (e) {
            console.error(e);
            setSchedules([]);
        }
    };

    const loadChats = async () => {
        if (status.state !== 'connected') return;
        setLoading(true);
        try {
            const res = await fetch("/api/whatsapp/chats/all");
            const data = await res.json();
            setChats(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            setChats([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadSchedules();
        loadChats();
    }, [status.state]);

    const handleCreate = async () => {
        if (!selectedChat || !message || !startTime || !endTime) return;
        
        await fetch("/api/whatsapp/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chatId: selectedChat.id,
                chatName: selectedChat.name,
                message,
                startTime,
                endTime,
                enabled: true
            })
        });
        
        setSelectedChat(null);
        setMessage('');
        loadSchedules();
    };

    const handleDelete = async (id: string) => {
        await fetch(`/api/whatsapp/schedules/${id}`, { method: "DELETE" });
        loadSchedules();
    };

    const handleToggle = async (id: string, enabled: boolean) => {
        await fetch(`/api/whatsapp/schedules/${id}/toggle`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: !enabled })
        });
        loadSchedules();
    };

    const filteredChats = chats.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase())).slice(0, 50);

    return (
        <div className="max-w-4xl">
            <h2 className="text-2xl font-bold mb-6">Scheduled Messages</h2>
            <p className="text-slate-600 mb-8 max-w-2xl">
                Set up messages to be sent randomly within a specific time range every day. Great for daily check-ins or automated follow-ups.
            </p>

            <div className="grid grid-cols-5 gap-8">
                <div className="col-span-2">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <CalendarClock size={18} /> New Schedule
                        </h3>
                        
                        <div className="space-y-4 text-sm">
                            <div>
                                <label className="block text-slate-600 mb-1 font-medium">Select Chat</label>
                                {selectedChat ? (
                                    <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 p-2 rounded-lg border border-emerald-100">
                                        <span className="font-medium">{selectedChat.name}</span>
                                        <button onClick={() => setSelectedChat(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold uppercase tracking-wider">Change</button>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="relative mb-2">
                                            <Search className="absolute left-3 top-2 text-slate-400" size={16} />
                                            <input 
                                                type="text" 
                                                placeholder="Search chats..." 
                                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg">
                                            {loading ? (
                                                <div className="p-3 text-center text-slate-500">Loading chats...</div>
                                            ) : filteredChats.length === 0 ? (
                                                <div className="p-3 text-center text-slate-500">No chats found.</div>
                                            ) : (
                                                filteredChats.map(c => (
                                                    <button 
                                                        key={c.id} 
                                                        onClick={() => setSelectedChat(c)}
                                                        className="w-full text-left p-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 truncate"
                                                    >
                                                        {c.name}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-slate-600 mb-1 font-medium">Message</label>
                                <textarea 
                                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none h-24"
                                    placeholder="Type the message to send..."
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-slate-600 mb-1 font-medium">Start Time</label>
                                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-1 font-medium">End Time</label>
                                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                </div>
                            </div>

                            <button 
                                onClick={handleCreate}
                                disabled={!selectedChat || !message}
                                className="w-full bg-slate-900 text-white rounded-lg py-2 font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Create Schedule
                            </button>
                        </div>
                    </div>
                </div>

                <div className="col-span-3 space-y-4">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Clock size={18} /> Active Schedules
                    </h3>
                    
                    {schedules.length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
                            No active schedules. Create one to get started.
                        </div>
                    ) : (
                        schedules.map(s => (
                            <div key={s.id} className={`bg-white border rounded-xl p-4 shadow-sm flex items-start gap-4 transition-opacity ${!s.enabled ? 'opacity-60 border-slate-200' : 'border-emerald-100'}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <MessageSquare size={14} className="text-slate-400" />
                                        <h4 className="font-semibold text-slate-800 truncate">{s.chatName}</h4>
                                    </div>
                                    <p className="text-slate-600 text-sm mb-3 line-clamp-2">{s.message}</p>
                                    
                                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                        <div className="bg-slate-100 px-2 py-1 rounded">Daily</div>
                                        <div className="flex items-center gap-1">
                                            <Clock size={12} /> {s.startTime} - {s.endTime}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-2 shrink-0">
                                    <button 
                                        onClick={() => handleToggle(s.id, s.enabled)}
                                        className={`p-2 rounded-lg transition-colors ${s.enabled ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        title={s.enabled ? "Disable" : "Enable"}
                                    >
                                        <Power size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(s.id)}
                                        className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
