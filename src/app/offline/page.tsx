export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-wms-bg flex flex-col items-center justify-center p-8 text-center font-sans">
      <div className="w-20 h-20 rounded-full bg-leon-red/10 border-2 border-leon-red/30 flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-leon-red">
          <line x1="2" x2="22" y1="2" y2="22" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
          <line x1="12" x2="12.01" y1="20" y2="20" />
        </svg>
      </div>
      <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic mb-3">
        Sin <span className="text-leon-red">Conexión</span>
      </h1>
      <p className="text-wms-muted text-sm max-w-xs">
        No hay conexión a internet. Verifica tu red Wi-Fi y vuelve a intentar.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-8 bg-leon-red hover:bg-leon-red-light text-white px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-leon-red/20"
      >
        Reintentar
      </button>
    </div>
  );
}
