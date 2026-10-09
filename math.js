// Procedural Math 1228 questions — fresh numbers every time.
(function(){
const R=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const fact=n=>n<=1?1:n*fact(n-1);
const P=(n,r)=>fact(n)/fact(n-r);
const C=(n,r)=>fact(n)/(fact(r)*fact(n-r));
const gcd=(a,b)=>b?gcd(b,a%b):a;
const frac=(n,d)=>{const g=gcd(n,d);return d/g===1?String(n/g):`${n/g}/${d/g}`};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function mc(t,q,ans,wrongs,e){
  const opts=[String(ans)];
  for(const w of wrongs){const s=String(w);if(!opts.includes(s)&&opts.length<4)opts.push(s)}
  const num=Number(ans);let k=1;
  while(opts.length<4&&k<60){
   let v;
   if(Number.isFinite(num)){const step=Number.isInteger(num)?(1+R(0,3)):Math.max(0.01,Math.abs(num)*0.15);v=String(Math.round((num+k*(k%2?1:-1)*step)*10000)/10000)}
   else{const d=R(2,12),n=R(1,d-1);v=frac(n,d)}
   if(!opts.includes(v)&&!(Number(v)<0))opts.push(v);k++;
  }
  const sh=shuffle(opts.slice());return {t,q,o:sh,a:sh.indexOf(String(ans)),e,gen:true};
}
const G={
 h1(){const A=R(12,30),B=R(10,25),AB=R(3,Math.min(A,B)-2),U=A+B-AB+R(2,10);
  return mc('h1',`In a class of ${U} students, ${A} take French, ${B} take Spanish and ${AB} take both. How many take neither?`,U-(A+B-AB),[U-A-B,U-(A+B),A+B-AB,U-AB],`n(A∪B) = ${A}+${B}−${AB} = ${A+B-AB}. Neither = ${U}−${A+B-AB} = ${U-(A+B-AB)}.`)},
 h2(){const s=R(3,6),p=R(2,5),d=R(2,4);
  return mc('h2',`An outfit has a shirt (${s} choices), pants (${p}) and shoes (${d}). How many outfits?`,s*p*d,[s+p+d,s*p+d,s*p],`Multiplication principle: ${s}×${p}×${d} = ${s*p*d}.`)},
 h2b(){const n=R(3,5);const tot=Math.pow(2,n);
  return mc('h2',`A coin is flipped ${n} times. How many sequences have at least one head?`,tot-1,[tot,n,tot/2],`Count the opposite: total 2^${n} = ${tot}, minus the 1 all-tails sequence = ${tot-1}.`)},
 h3(){const n=R(5,8),r=R(2,4);
  return mc('h3',`How many ways can ${r} distinct prizes be awarded to ${n} people (no one wins twice)?`,P(n,r),[C(n,r),Math.pow(n,r),n*r],`Order matters → P(${n},${r}) = ${n}!/(${n}−${r})! = ${P(n,r)}.`)},
 h3b(){const n=R(5,8);
  return mc('h3',`In how many ways can ${n} people sit around a circular table?`,fact(n-1),[fact(n),fact(n-2),n],`Circular permutations: (n−1)! = ${n-1}! = ${fact(n-1)}.`)},
 h4(){const n=R(7,12),r=R(2,4);
  return mc('h4',`A committee of ${r} is chosen from ${n} people. How many committees are possible?`,C(n,r),[P(n,r),n*r,Math.pow(2,n)],`Order doesn't matter → C(${n},${r}) = ${C(n,r)}.`)},
 h4b(){const m=R(4,7),w=R(4,7);
  return mc('h4',`Choose a committee of 2 men and 2 women from ${m} men and ${w} women.`,C(m,2)*C(w,2),[C(m+w,4),C(m,2)+C(w,2),P(m,2)*P(w,2)],`C(${m},2)×C(${w},2) = ${C(m,2)}×${C(w,2)} = ${C(m,2)*C(w,2)}.`)},
 h5(){const a=R(2,3),b=R(2,3),c=R(1,3),n=a+b+c;const ans=fact(n)/(fact(a)*fact(b)*fact(c));
  return mc('h5',`${n} students are split into labelled groups of sizes ${a}, ${b} and ${c}. How many ways?`,ans,[fact(n),C(n,a),ans*2],`Multinomial: ${n}!/(${a}!·${b}!·${c}!) = ${ans}.`)},
 h5b(){const k=R(2,3),n=k*2;const lab=fact(n)/Math.pow(2,k);const ans=lab/fact(k);
  return mc('h5',`${n} people are split into ${k} UNLABELLED pairs. How many ways?`,ans,[lab,fact(n),C(n,2)],`Labelled: ${n}!/(2!)^${k} = ${lab}. The groups can't be told apart, so divide by ${k}! → ${ans}.`)},
 h6(){const r=R(2,6),b=R(2,6),n=r+b;
  return mc('h6',`A bag has ${r} red and ${b} blue marbles. Two are drawn without replacement. P(both red)?`,frac(C(r,2),C(n,2)),[frac(r*r,n*n),frac(r,n),frac(C(b,2),C(n,2))],`Equiprobable: C(${r},2)/C(${n},2) = ${C(r,2)}/${C(n,2)} = ${frac(C(r,2),C(n,2))}.`)},
 h6b(){const s=R(5,10);
  return mc('h6',`Two fair dice are rolled. What is P(sum = ${s})?`,frac(6-Math.abs(7-s),36),[frac(1,6),frac(1,36),frac(s,36)],`Of 36 equally likely outcomes, ${6-Math.abs(7-s)} give a sum of ${s}.`)},
 h7(){const pA=R(3,6)/10,pB=R(3,6)/10,pAB=Math.round(pA*pB*100)/100;
  return mc('h7',`A and B are independent with P(A)=${pA} and P(B)=${pB}. Find P(A∩B).`,pAB,[Math.round((pA+pB)*100)/100,Math.round((pA+pB-pAB)*100)/100,pA],`Independent → P(A∩B) = P(A)·P(B) = ${pAB}.`)},
 h7b(){const pAB=R(1,3)/10,pB=R(4,8)/10;const ans=Math.round(pAB/pB*1000)/1000;
  return mc('h7',`P(A∩B) = ${pAB} and P(B) = ${pB}. Find P(A | B) (to 3 decimals).`,ans,[Math.round(pAB*pB*1000)/1000,Math.round(pB/pAB*1000)/1000,pAB],`P(A|B) = P(A∩B)/P(B) = ${pAB}/${pB} = ${ans}.`)},
 h8(){const d=R(1,5)/100,sens=R(90,98)/100,fp=R(3,10)/100;const num=d*sens,den=num+(1-d)*fp;const ans=Math.round(num/den*1000)/1000;
  return mc('h8',`${Math.round(d*100)}% of people have a disease. The test is positive ${Math.round(sens*100)}% of the time if sick, and ${Math.round(fp*100)}% if healthy. P(sick | positive)? (3 dp)`,ans,[sens,Math.round(num*1000)/1000,Math.round((1-ans)*1000)/1000],`Bayes: (${d}·${sens}) / (${d}·${sens} + ${Math.round((1-d)*100)/100}·${fp}) ≈ ${ans}.`)},
 h9(){const n=R(4,6),k=R(1,n-1);const ans=Math.round(C(n,k)*Math.pow(0.5,n)*10000)/10000;
  return mc('h9',`A fair coin is tossed ${n} times. P(exactly ${k} heads)? (4 dp)`,ans,[Math.round(Math.pow(0.5,n)*10000)/10000,Math.round(k/n*10000)/10000,Math.round(C(n,k)/n*10000)/10000],`Repeated independent trials: C(${n},${k})(½)^${n} = ${C(n,k)}/${Math.pow(2,n)} = ${ans}.`)}
};
const byTopic={};Object.entries(G).forEach(([k,f])=>{const t=k.replace(/b$/,'');(byTopic[t]=byTopic[t]||[]).push(f)});
window.genMath=t=>{const fs=byTopic[t];return fs?fs[Math.floor(Math.random()*fs.length)]():null};
})();
