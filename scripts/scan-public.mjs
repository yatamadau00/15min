import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z']).toString().split('\0').filter(Boolean);
const patterns=[
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['GitHub token',/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
 ['Google API key',/AIza[A-Za-z0-9_-]{30,}/],
 ['Google OAuth secret',/GOCSPX-[A-Za-z0-9_-]{20,}/],
 ['AWS access key',/AKIA[0-9A-Z]{16}/],
 ['Library transfer',/oaiusercontent\.com|libfile_[A-Za-z0-9_-]+|ldc1\./],
 ['personal home path',/\/Users\/[A-Za-z][A-Za-z0-9_-]+\//],
 ['private hosting metadata',/sites-connector-preview|oai-authenticated-user-full-name|local_seedy|seedy@sites\.test/],
];
let failed=false;
for(const file of files){
 if(/(^|\/)(\.env(?:\..*)?|\.dev\.vars(?!\.example$).*|\.openai|\.source-import|\.wrangler|node_modules|dist)(\/|$)|\.(sqlite|db|pem|tar\.gz)$/.test(file)){console.error('Forbidden path:',file);failed=true;}
 if(file.endsWith('.png'))continue;
 const text=readFileSync(file,'utf8');
 // The scanner contains signatures, not credential values.
 if(file==='scripts/scan-public.mjs')continue;
 for(const [name,re] of patterns)if(re.test(text)){console.error(name+': '+file);failed=true;}
}
if(failed)process.exit(1);
console.log(`PASS: ${files.length} tracked files checked; no forbidden paths or known secret signatures.`);
