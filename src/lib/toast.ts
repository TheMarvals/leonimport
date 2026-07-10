import Swal from 'sweetalert2';

export const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
  if (typeof window === 'undefined') return;
  
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: '#1e293b', // WMS Dark slate-800
    color: '#f8fafc',      // WMS light text slate-50
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    }
  });

  Toast.fire({
    icon: type,
    title: message
  });
};

export const showConfirmModal = (title: string, text: string, confirmButtonText: string = 'Confirmar') => {
  if (typeof window === 'undefined') return Promise.resolve({ isConfirmed: false });

  return Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    buttonsStyling: false,
    confirmButtonText,
    cancelButtonText: 'Cancelar',
    background: '#12161F',
    color: '#ffffff',
    customClass: {
      popup: 'bg-wms-surface border border-wms-border rounded-[2rem] shadow-[0_0_40px_rgba(0,0,0,0.5)]',
      title: 'text-2xl md:text-3xl font-black tracking-tighter uppercase text-white',
      htmlContainer: 'text-wms-muted text-sm md:text-base mt-2',
      actions: 'flex gap-4 mt-8 w-full justify-center',
      confirmButton: 'bg-leon-red hover:bg-leon-red-light text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-leon-red/20',
      cancelButton: 'bg-wms-bg border border-wms-border hover:bg-white/5 text-wms-muted hover:text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-sm uppercase tracking-widest transition-all active:scale-95'
    }
  });
};

export const showModalAlert = (title: string, text: string, icon: 'success' | 'error' | 'warning' | 'info' = 'success') => {
  if (typeof window === 'undefined') return Promise.resolve({} as any);

  return Swal.fire({
    title,
    text,
    icon,
    buttonsStyling: false,
    background: '#12161F',
    color: '#ffffff',
    customClass: {
      popup: 'bg-wms-surface border border-wms-border rounded-[2rem] shadow-[0_0_40px_rgba(0,0,0,0.5)]',
      title: 'text-2xl md:text-3xl font-black tracking-tighter uppercase text-white',
      htmlContainer: 'text-wms-muted text-sm md:text-base mt-2',
      actions: 'flex gap-4 mt-8 w-full justify-center',
      confirmButton: 'bg-leon-red hover:bg-leon-red-light text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-leon-red/20'
    }
  });
};
