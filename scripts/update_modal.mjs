import fs from 'fs';

let code = fs.readFileSync('src/components/AlumniProfileEditModal.tsx', 'utf-8');
code = code.replace(
  'className="alumni-modal-backdrop"',
  'className="alumni-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"'
);
code = code.replace(
  'className="alumni-modal-container"',
  'className="alumni-modal-container relative w-full max-w-2xl bg-[#111425] border border-amber-500/40 rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl my-auto"'
);
fs.writeFileSync('src/components/AlumniProfileEditModal.tsx', code, 'utf-8');
console.log('Modal classes updated successfully!');

