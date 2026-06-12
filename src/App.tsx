import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, Settings, UploadCloud, FileText, CheckCircle2, AlertCircle, Play, Square, User, Loader2, CalendarClock } from 'lucide-react';
import Scheduler from './Scheduler';

type BotStatus = {
  state: "disconnected" | "connecting" | "connected" | "error";
  qrUpdate: string | null;
  error: string | null;
  botEnabled: boolean;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'connection' | 'training' | 'scheduler' | 'deployment'>('connection');
  const [status, setStatus] = useState<BotStatus>({
    state: "disconnected",
    qrUpdate: null,
    error: null,
    botEnabled: false,
  });
  
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [trainingPrompt, setTrainingPrompt] = useState("");

  const pollStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      if (data && data.state) {
         setStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Load training prompt
    fetch("/api/whatsapp/train").then(res => res.json()).then(data => {
      setTrainingPrompt(data.prompt);
    }).catch(console.error);
  }, [activeTab]);

  const handleStartConnection = async () => {
    setStatus(prev => ({ ...prev, state: "connecting" }));
    await fetch("/api/whatsapp/start", { method: "POST" });
  };

  const handleToggleBot = async () => {
    const newState = !status.botEnabled;
    await fetch("/api/whatsapp/config", {
       method: "POST", 
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ enabled: newState })
    });
    pollStatus();
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append("screenshots", f));

    try {
       const res = await fetch("/api/whatsapp/train", {
          method: "POST",
          body: formData
       });
       const data = await res.json();
       if (data.success) {
          setTrainingPrompt(data.prompt);
          setFiles([]);
          alert("Training successful! Persona prompt updated.");
       } else {
          alert("Error: " + data.error);
       }
    } catch (e: any) {
       alert("Upload failed: " + e.message);
    } finally {
       setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
       {/* Sidebar/Nav */}
       <div className="flex">
          <div className="w-64 bg-white border-r border-slate-200 min-h-screen p-6 flex flex-col">
             <div className="flex items-center gap-3 mb-10 text-emerald-600">
                <User size={28} />
                <h1 className="text-xl font-bold tracking-tight text-slate-900">MEBOT</h1>
             </div>

             <nav className="space-y-2 flex-grow">
                <button 
                  onClick={() => setActiveTab('connection')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'connection' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                   <Smartphone size={18} />
                   Connection
                </button>
                <button 
                  onClick={() => setActiveTab('training')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'training' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                   <Settings size={18} />
                   Bot Persona
                </button>
                <button 
                  onClick={() => setActiveTab('scheduler')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'scheduler' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                   <CalendarClock size={18} />
                   Scheduler
                </button>
                <button 
                  onClick={() => setActiveTab('deployment')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'deployment' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                   <Settings size={18} />
                   Hosting & Config
                </button>
             </nav>

             <div className="pt-6 border-t border-slate-200 mt-auto">
                <div className="p-4 bg-slate-50 rounded-xl">
                   <div className="flex items-center justify-between mb-2">
                       <span className="text-sm font-medium">Bot Engine</span>
                       <div className={`w-2 h-2 rounded-full ${status.botEnabled ? "bg-emerald-500" : "bg-slate-300"}`}></div>
                   </div>
                   <button 
                     onClick={handleToggleBot}
                     disabled={status.state !== "connected"}
                     className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white transition-opacity ${status.state !== "connected" ? 'opacity-50 bg-slate-400 cursor-not-allowed' : status.botEnabled ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                   >
                      {status.botEnabled ? <><Square size={14}/> Stop Bot</> : <><Play size={14} /> Start Bot</>}
                   </button>
                </div>
             </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-10">
             {activeTab === 'connection' && (
                <div className="max-w-3xl">
                   <h2 className="text-2xl font-bold mb-6">WhatsApp Connection</h2>
                   
                   <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                       <div className="flex items-center gap-6 mb-8">
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${status.state === 'connected' ? 'bg-emerald-100 text-emerald-600' : status.state === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                             {status.state === 'connected' ? <CheckCircle2 size={32} /> : status.state === 'error' ? <AlertCircle size={32} /> : <QrCode size={32} />}
                          </div>
                          <div>
                             <h3 className="text-lg font-semibold capitalize">{status.state}</h3>
                             <p className="text-slate-500 text-sm">
                                {status.state === 'disconnected' && "Click connect to generate a QR code."}
                                {status.state === 'connecting' && "Starting browser, holding on..."}
                                {status.state === 'connected' && "WhatsApp is linked and active. Engine ready."}
                                {status.state === 'error' && (status.error || "Failed to connect to WhatsApp network.")}
                             </p>
                          </div>
                       </div>

                       {status.state === 'disconnected' && !status.qrUpdate && (
                          <button onClick={handleStartConnection} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors">
                             Generate QR Code
                          </button>
                       )}

                       {status.qrUpdate && status.state === 'disconnected' && (
                          <div className="bg-slate-50 rounded-xl p-8 flex flex-col items-center justify-center border border-slate-200">
                             <h4 className="font-semibold mb-4 text-center">Scan to Connect</h4>
                             <img src={status.qrUpdate} alt="QR Code" className="w-64 h-64 border-4 border-white shadow-sm rounded-xl" />
                             <p className="text-sm text-slate-500 mt-4 text-center">Open WhatsApp on your phone {"->"} Linked Devices</p>
                          </div>
                       )}

                       {status.state === 'connected' && (
                          <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 flex items-start gap-4 text-emerald-800">
                             <CheckCircle2 className="shrink-0 mt-0.5" />
                             <div className="text-sm">
                                <span className="font-semibold block mb-1">Session Active</span>
                                The system is connected. Any manual replies you send from your phone will automatically pause the bot for 5 minutes in that chat to prevent overlapping messages.
                             </div>
                          </div>
                       )}
                   </div>
                </div>
             )}

             {activeTab === 'training' && (
                <div className="max-w-4xl">
                   <h2 className="text-2xl font-bold mb-6">Persona Training</h2>
                   <p className="text-slate-600 mb-8 max-w-2xl">
                      Upload screenshots of your usual WhatsApp chats. The system uses vision AI to analyze your tone, vocabulary, length, and languages (English, Sinhala, Singlish) to generate a perfect replica prompt.
                   </p>

                   <div className="grid grid-cols-2 gap-8">
                       <div>
                          <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-8 text-center">
                             <UploadCloud className="mx-auto text-slate-400 mb-4" size={40} />
                             <h3 className="font-semibold mb-2">Upload Screenshots</h3>
                             <p className="text-sm text-slate-500 mb-6">PNG, JPG up to 5MB.</p>
                             <input 
                                type="file" 
                                multiple 
                                accept="image/*"
                                className="hidden" 
                                id="file-upload"
                                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                             />
                             <label htmlFor="file-upload" className="bg-slate-100 text-slate-700 px-5 py-2 rounded-lg font-medium cursor-pointer hover:bg-slate-200 transition-colors">
                                Select Files
                             </label>

                             {files.length > 0 && (
                                <div className="mt-6 text-left">
                                   <div className="text-sm font-medium mb-3">Selected ({files.length}):</div>
                                   <div className="space-y-2">
                                      {files.map((f, i) => (
                                         <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-md">
                                            <FileText size={14} />
                                            <span className="truncate">{f.name}</span>
                                         </div>
                                      ))}
                                   </div>
                                   <button 
                                      onClick={handleUpload}
                                      disabled={isUploading}
                                      className="w-full mt-4 bg-emerald-600 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2"
                                   >
                                      {isUploading ? <><Loader2 size={16} className="animate-spin" /> Analyzing...</> : "Train Persona"}
                                   </button>
                                </div>
                             )}
                          </div>
                          
                          <div className="bg-amber-50 mt-6 p-4 rounded-xl border border-amber-100 text-sm text-amber-800">
                             <strong>Cloudflare Zero Trust</strong>: When deploying to your AWS t3 server, you can use `cloudflared tunnel` to securely expose port 3000 to your domain without opening AWS security groups.
                          </div>
                       </div>

                       <div>
                          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-full shadow-lg flex flex-col">
                             <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-100">Generated System Prompt</h3>
                             </div>
                             <textarea 
                               className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                               value={trainingPrompt}
                               readOnly
                               placeholder="Upload screenshots to generate a persona prompt..."
                             />
                          </div>
                       </div>
                   </div>
                </div>
             )}

             {activeTab === 'scheduler' && (
                <Scheduler status={status} />
             )}

             {activeTab === 'deployment' && (
                <div className="max-w-4xl">
                   <h2 className="text-2xl font-bold mb-6">Hosting & Setup Guide</h2>
                   <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 text-slate-800">
                      
                      <div>
                         <h3 className="text-lg font-bold text-slate-900 mb-2">1. Environment Variables (.env)</h3>
                         <p className="mb-3 text-slate-600">The <code>.env.example</code> file is located at the root of the project directory. Create a new file named <code>.env</code> in the same location with the following contents:</p>
                         <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-emerald-400">
GEMINI_API_KEY="your_api_key_here"
                         </div>
                      </div>

                      <div>
                         <h3 className="text-lg font-bold text-slate-900 mb-2">2. Deploying on AWS t3 (Ubuntu/Debian)</h3>
                         <p className="text-slate-600 mb-2">Connect to your EC2 instance via SSH, install Node.js and PM2, then start the server.</p>
                         <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm inline-block w-full text-slate-300">
<p className="text-emerald-400 mb-1"># 1. Install System Dependencies for Puppeteer (Ubuntu)</p>
sudo apt-get update && sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64<br/><br/>
<p className="text-emerald-400 mb-1"># 2. Install Node dependencies</p>
npm install<br/><br/>
<p className="text-emerald-400 mb-1"># 3. Install Puppeteer Chrome binaries</p>
npx puppeteer browsers install chrome<br/><br/>
<p className="text-emerald-400 mb-1"># 4. Build the project</p>
npm run build<br/><br/>
<p className="text-emerald-400 mb-1"># 5. Start the process via PM2 to keep it running</p>
npm install -g pm2<br/>
pm2 start "NODE_ENV=production node dist/server.cjs" --name "mebot"<br/>
pm2 startup<br/>
pm2 save
                         </div>
                      </div>

                      <div>
                         <h3 className="text-lg font-bold text-slate-900 mb-2">3. Expose to Domain using Cloudflare Tunnel</h3>
                         <p className="text-slate-600 mb-2">To securely expose your local bot dashboard (Port 3000) to the internet without opening any AWS Security Group inbound ports:</p>
                         <ul className="list-decimal pl-5 text-slate-600 space-y-2 mb-4">
                             <li>Login to <a href="https://one.dash.cloudflare.com/" className="text-emerald-600 hover:underline" target="_blank" rel="noreferrer">Cloudflare Zero Trust Dashboard</a></li>
                             <li>Go to <strong>Networks {"->"} Tunnels</strong> and click <strong>Create a tunnel</strong></li>
                             <li>Name the tunnel and copy the provided Token carefully.</li>
                             <li>Run the following commands on your AWS t3 Ubuntu server to install the Cloudflare daemon.</li>
                         </ul>
                         
                         <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm inline-block w-full text-slate-300">
<p className="text-emerald-400 mb-1"># 1. Download the latest cloudflared package</p>
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb<br/><br/>
<p className="text-emerald-400 mb-1"># 2. Install the package</p>
sudo dpkg -i cloudflared-linux-amd64.deb<br/><br/>
<p className="text-emerald-400 mb-1"># 3. Install the service using your token (replaces YOUR_TOKEN)</p>
sudo cloudflared service install YOUR_TOKEN<br/><br/>
<p className="text-emerald-400 mb-1"># 4. Start the service</p>
sudo systemctl start cloudflared<br/>
sudo systemctl enable cloudflared
                         </div>

                         <div className="mt-4 text-slate-600">
                             <p className="mb-2"><strong>Final Step:</strong> Back in the Cloudflare Dashboard, configure the Public Hostname:</p>
                             <ul className="list-disc pl-5">
                                 <li><strong>Subdomain/Domain:</strong> e.g. <code>bot.yourdomain.com</code></li>
                                 <li><strong>Service Type:</strong> HTTP</li>
                                 <li><strong>Service URL:</strong> <code>localhost:3000</code></li>
                             </ul>
                         </div>

                         <div className="mt-6 bg-red-50 rounded-xl p-4 border border-red-100">
                             <h4 className="text-red-800 font-bold mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                Troubleshooting 502 Bad Gateway
                             </h4>
                             <p className="text-red-700 text-sm mb-3">If you see a 502 error on your domain, it means Cloudflare can't reach your server on port 3000. Check the following:</p>
                             <ul className="list-disc pl-5 text-red-700 text-sm space-y-1">
                                 <li>Make sure PM2 or the Node server is actually running: <code>pm2 status</code></li>
                                 <li>Check server logs for errors: <code>pm2 logs mebot</code></li>
                                 <li>If you see <strong>Could not find Chrome</strong>, run: <code>npx puppeteer browsers install chrome</code> inside your project directory.</li>
                                 <li>If you see <strong>error while loading shared libraries (like libatk-1.0.so.0)</strong>, run: <code>sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2t64</code> on your server.</li>
                                 <li>If you get <strong>GEMINI_API_KEY is missing</strong> even though the <code>.env</code> is created, run: <code>npm run build && pm2 restart mebot</code> to reload variables.</li>
                                 <li>If you see <strong>EACCES: permission denied</strong> on <code>uploads</code> or <code>.wwebjs_auth</code>, run: <code>sudo chown -R $USER:$USER /home/ubuntu/mebot</code> inside your project directory to fix permissions.</li>
                                 <li>Ensure Service URL in Cloudflare is set to exactly <code>localhost:3000</code> (Not HTTPS).</li>
                                 <li>Ensure the port is correct. By default, this app runs on port 3000.</li>
                             </ul>
                         </div>
                      </div>

                   </div>
                </div>
             )}
          </div>
       </div>
    </div>
  );
}

