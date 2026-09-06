import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({
 root:root+'github-pages',base:'/SFU-DigitalTwin/',publicDir:root+'public',
 resolve:{alias:{'@':root}},plugins:[react()],css:{postcss:{plugins:[tailwindcss()]}},
 define:{__PUBLIC_VIEWER__:'true',__ASSET_BASE__:JSON.stringify('/SFU-DigitalTwin/')},
 build:{outDir:root+'dist-pages',emptyOutDir:true,sourcemap:false},
});
