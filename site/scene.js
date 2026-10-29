/* clonometer: the object. Raw WebGL2, one raymarched fragment shader, no libraries.
   A drum counter in a bevelled housing of brushed titanium and patinated brass, on a plinth, in a gallery. */
(function () {
  'use strict';

  var VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}';

  var FS = `#version 300 es
precision highp float;
out vec4 oc;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uTgt; uniform float uSpan, uYaw, uPitch, uShiftY;
uniform float uTrap, uKeep, uDebug;
uniform float uSpot, uCover, uCollapse, uGlow, uStill;
uniform float uAng[7], uVel[7], uDX[7], uSX[2];
uniform vec4 uBead[36]; uniform float uBA[36];
uniform sampler2D tDig, tFace, tCov, tGau, tPlq;

const float WX=0.75, WHX=2.65, WHY=0.5, R=0.95, ZC=-1.05, GX=-3.02, GHX=0.62;
const float PI=3.14159265, TH=0.2493;
const vec3 AIM=vec3(0.,-0.6,-1.);
vec3 Lp;

float hash(vec2 p){ p=fract(p*vec2(.1031,.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(7.1,3.7); a*=.5;} return s; }

float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdRB(vec3 p, vec3 b, float r){ return sdBox(p,b-r)-r; }
vec2 mn(vec2 a, vec2 b){ return a.x<b.x?a:b; }
float coverY(){ return mix(1.12,0.,uCover); }

// ids: 0 floor, 1 titanium housing, 2 brass, 3 drums, 6 wall, 7 cover, 8 plinth
vec2 map(vec3 p){
  vec2 res=vec2(p.y+6.1,0.);
  res=mn(res,vec2(min(24.-p.y,min(p.z+6.5,min(40.-p.z,min(p.x+40.,40.-p.x)))),6.));
  float bb=sdBox(p-vec3(0.1,-1.3,-1.1),vec3(5.0,4.4,2.4));
  if(bb>0.4) return mn(res,vec2(bb,8.));
  res=mn(res,vec2(sdRB(p-vec3(0.,-4.1,-1.1),vec3(4.35,2.05,2.0),0.02),8.));
  res=mn(res,vec2(sdRB(p-vec3(0.,-2.0,-1.1),vec3(4.62,0.07,2.2),0.05),8.));
  vec3 q=p;
  float hs=sdRB(q-vec3(0.,0.,-1.1),vec3(4.,1.95,1.1),0.1);
  float pl=sdRB(q,vec3(3.86,1.81,0.07),0.03);
  float body=min(hs,pl);
  float cutW=sdRB(q-vec3(WX,0.,-0.3),vec3(WHX,WHY,0.6),0.02);
  float cav=sdBox(q-vec3(WX,0.,-1.15),vec3(2.72,1.08,0.95));
  float cutG=sdRB(q-vec3(GX,0.,-0.05),vec3(GHX,WHY,0.35),0.03);
  body=max(body,-cutW); body=max(body,-cav); body=max(body,-cutG);
  float rW=max(sdRB(q-vec3(WX,0.,0.02),vec3(WHX+0.14,WHY+0.14,0.11),0.035),-cutW);
  float rG=max(sdRB(q-vec3(GX,0.,0.02),vec3(GHX+0.14,WHY+0.14,0.11),0.035),-cutG);
  float dr=max(length(vec2(q.y,q.z-ZC))-R,abs(q.x-WX)-2.55);
  res=mn(res,vec2(body,1.));
  res=mn(res,vec2(min(rW,rG),2.));
  res=mn(res,vec2(dr,3.));
  // one pipe: riser from the plinth, over the top, a run of 14 slots, a taped leak, a funnel into the counter
  vec3 rq=p-vec3(-4.38,0.,-0.5);
  float pipeF=max(length(rq.xz)-0.165,abs(p.y+1.74)-0.19);
  pipeF=min(pipeF,max(abs(length(rq.xz)-0.18)-0.025,abs(p.y-2.55)-0.2));
  vec3 hq=p-vec3(0.,2.55,-0.5);
  float jr=clamp(floor((p.x+3.81)/0.52+0.5),0.,14.); float rxx=-3.81+0.52*jr;
  float rings=length(vec2(length(hq.yz)-0.17,p.x-rxx))-0.013;
  float rt=mix(0.17,0.33,smoothstep(3.5,3.75,p.x));
  float trough=max(max(abs(length(hq.yz)-rt)-0.022,max(3.47-p.x,p.x-4.15)),-hq.y-0.07);
  trough=min(trough,max(length(hq.yz)-rt,abs(p.x-4.01)-0.015));
  vec3 fq=p-vec3(3.72,0.,-0.5);
  float funnel=max(abs(length(fq.xz)-mix(0.22,0.5,clamp((p.y-2.0)/0.34,0.,1.)))-0.022,abs(p.y-2.17)-0.17)*0.7;
  float posts=min(min(sdRB(p-vec3(-2.5,2.2,-0.5),vec3(0.05,0.22,0.05),0.01),sdRB(p-vec3(0.2,2.2,-0.5),vec3(0.05,0.22,0.05),0.01)),sdRB(p-vec3(2.9,2.2,-0.5),vec3(0.05,0.22,0.05),0.01));
  float brk=min(max(length(p.yz-vec2(1.2,-0.5))-0.04,abs(p.x+4.12)-0.15),max(length(p.yz-vec2(-0.8,-0.5))-0.04,abs(p.x+4.12)-0.15));
  // box details: handle, hinge barrels, cable gland
  float handle=min(length(p-clamp(p,vec3(-0.5,2.12,-1.5),vec3(0.5,2.12,-1.5)))-0.032,min(sdRB(p-vec3(-0.5,2.03,-1.5),vec3(0.03,0.1,0.03),0.01),sdRB(p-vec3(0.5,2.03,-1.5),vec3(0.03,0.1,0.03),0.01)));
  float hinge=min(max(length(p.xz-vec2(4.05,-0.45))-0.045,abs(p.y-0.6)-0.3),max(length(p.xz-vec2(4.05,-1.7))-0.045,abs(p.y-0.6)-0.3));
  float gland=min(max(length(p.xz-vec2(-3.1,-1.7))-0.085,abs(p.y-2.03)-0.09),length(p.xy-vec2(-3.1,2.1))-0.03+max(0.,0.)*0.);
  gland=min(gland,max(length(p.xy-vec2(-3.1,2.12))-0.03,max(abs(p.z+1.95)-0.25,0.)));
  hinge=min(hinge,min(max(length(p.xz-vec2(-4.05,-1.7))-0.045,abs(p.y-0.6)-0.3),max(length(p.xz-vec2(-4.05,-1.0))-0.045,abs(p.y-0.6)-0.3)));
  // the tape: layered cloth tape wrapped over the split, torn edges, slightly raised
  float ang=atan(hq.z,hq.y);
  float tl1=0.4+0.06*(vn(vec2(ang*3.,1.))-0.5);
  float tape1=max(abs(length(hq.yz)-rt-0.03)-0.015,max(abs(p.x-3.8)-tl1,-hq.y-0.2));
  float tl2=0.24+0.05*(vn(vec2(ang*4.,7.))-0.5);
  float tape2=max(abs(length(hq.yz)-rt-0.046)-0.013,max(abs(p.x-3.68)-tl2,-hq.y-0.04));
  float tl3=0.18+0.045*(vn(vec2(ang*5.,3.))-0.5);
  float tape3=max(abs(length(hq.yz)-rt-0.06)-0.012,max(abs(p.x-3.98)-tl3,-hq.y-0.12));
  float tape=min(tape1,min(tape2,tape3));
  vec3 gk=p-vec3(0.,-1.9,-1.1);
  float gasket=max(sdRB(gk,vec3(4.62,0.045,2.2),0.015),-sdBox(gk,vec3(4.54,0.1,2.12)));
  float hw=min(min(min(pipeF,brk),min(posts,min(rings,min(trough,funnel)))),min(gasket,min(handle,min(hinge,gland))));
  res=mn(res,vec2(hw,2.));
  res=mn(res,vec2(tape,13.));
  res=mn(res,vec2(sdRB(p-vec3(0.,-2.57,0.908),vec3(2.8,0.36,0.012),0.004),10.));
  // beads, only evaluated near the flow
  float bd=min(sdBox(p-vec3(-4.38,0.4,-0.5),vec3(0.35,2.35,0.35)),sdBox(p-vec3(-0.3,2.3,-0.5),vec3(4.5,0.45,0.4)));
  if(bd>0.15){ res=mn(res,vec2(bd,9.)); }
  else { float db=1e3; for(int i=0;i<36;i++){ db=min(db,length(p-uBead[i].xyz)-uBead[i].w); } res=mn(res,vec2(db,9.)); }
  return res;
}
vec2 march(vec3 ro, vec3 rd){
  float t=0.;
  for(int i=0;i<150;i++){
    vec2 h=map(ro+rd*t);
    if(h.x<0.0005*t+0.0003) return vec2(t,h.y);
    t+=h.x*0.92;
    if(t>110.) return vec2(t,-1.);
  }
  return vec2(t,map(ro+rd*t).y);
}
vec3 nrm(vec3 p){ vec2 e=vec2(1,-1)*0.0008;
  return normalize(e.xyy*map(p+e.xyy).x+e.yyx*map(p+e.yyx).x+e.yxy*map(p+e.yxy).x+e.xxx*map(p+e.xxx).x); }
float sshadow(vec3 ro, vec3 rd, float tmax){
  float res=1., t=0.02;
  for(int i=0;i<44;i++){
    float h=map(ro+rd*t).x;
    res=min(res,7.*h/t);
    t+=clamp(h,0.02,0.5);
    if(res<0.003||t>tmax) break;
  }
  res=clamp(res,0.,1.); return res*res*(3.-2.*res);
}
float calcAO(vec3 p, vec3 n){
  float o=0., s=1.;
  for(int i=0;i<5;i++){ float h=0.02+0.11*float(i); float d=map(p+n*h).x; o+=(h-d)*s; s*=0.72; }
  return clamp(1.-1.7*o,0.,1.);
}
vec3 keyDir(){ return normalize(Lp-vec3(0.,0.,0.)); }

vec3 envMap(vec3 r, float rough, float keyVis){
  float up=r.y;
  vec3 c=mix(vec3(0.30,0.285,0.265),vec3(0.62,0.64,0.66),smoothstep(-0.25,0.85,up));
  c=mix(c,vec3(0.20,0.19,0.18),smoothstep(0.0,-0.6,up)*0.7);
  c+=vec3(0.16)*smoothstep(0.6,1.0,r.z)*smoothstep(-0.4,0.2,up);       // broad front fill
  vec3 K=keyDir();
  float kd=max(dot(r,K),0.);
  c+=vec3(1.0,0.95,0.88)*keyVis*(5.5*pow(kd,mix(220.,10.,rough))+0.55*pow(kd,4.));
  // gallery track light strips
  float b1=smoothstep(0.06+rough*0.35,0.,abs(up-0.62))*smoothstep(1.4,0.5,abs(r.x))*step(-0.3,r.z);
  c+=vec3(0.9,0.93,1.0)*1.5*b1;
  c+=vec3(0.55,0.70,1.0)*0.9*smoothstep(0.1,0.7,-r.z)*smoothstep(-0.3,0.5,up);       // rim light from behind
  float kf=max(dot(r,normalize(vec3(-0.7,0.25,0.65))),0.);
  c+=vec3(0.75,0.85,1.0)*0.9*pow(kf,mix(24.,5.,rough));                                 // soft cool fill
  float az=atan(r.x,r.z+1e-4);
  float aK=atan(K.x,K.z);
  float st=smoothstep(0.09+rough*0.4,0.,abs(az-aK-0.5))*smoothstep(0.95,0.25,abs(up))*step(0.,r.z);
  c+=vec3(1.0,0.97,0.92)*1.1*st;
  return c;
}
float coneAt(vec3 p){ vec3 ld=normalize(Lp-p); return smoothstep(0.80,0.975,dot(-ld,normalize(AIM-Lp))); }

float scr(vec2 q, float fp){ float s=0.;
  for(int i=0;i<3;i++){ float a=1.1*float(i)+0.4; vec2 r=vec2(cos(a)*q.x+sin(a)*q.y,-sin(a)*q.x+cos(a)*q.y);
    float v=r.y*26.; float cell=floor(v); float h=hash(vec2(cell,float(i)*5.1));
    float u0=h*7.-3.5; float len=0.3+h*1.6; float along=smoothstep(0.,0.08,r.x-u0)*smoothstep(0.,0.08,u0+len-r.x);
    s+=step(0.7,h)*along*smoothstep(0.12,0.0,abs(fract(v)-0.5)); }
  return clamp(s,0.,1.)*clamp(1.-fp*26.,0.,1.); }
float prints(vec2 q){ float s=0.;
  for(int i=0;i<6;i++){ vec2 c=vec2(hash(vec2(float(i),1.3)),hash(vec2(float(i),7.1)))*vec2(8.,5.)-vec2(4.,1.8);
    float d=length((q-c)*vec2(1.,1.3)); float rings=0.5+0.5*sin(d*110.+float(i));
    s+=smoothstep(0.36,0.08,d)*(0.3+0.7*rings); }
  return clamp(s,0.,1.); }

vec3 plaster(vec2 q, float fp, vec3 base){
  float f=fbm(q*1.1)*0.6+fbm(q*9.)*0.25;
  float sp=hash(floor(q*80.)); float aa=clamp(1.-fp*80.,0.,1.);
  return base*(0.86+0.28*f)*(1.+0.05*(sp-0.5)*aa);
}

vec3 vitrine(vec3 ro, vec3 rd, float tHit, vec3 col){
  vec3 c=vec3(0.,0.7885,-1.1), h=vec3(4.58,2.7185,2.16);
  vec3 inv=1./rd, a=(c-h-ro)*inv, b=(c+h-ro)*inv;
  vec3 mi=min(a,b), ma=max(a,b);
  float tn=max(max(mi.x,mi.y),mi.z), tf=min(min(ma.x,ma.y),ma.z);
  if(tn<0.||tn>tf||tn>tHit) return col;
  vec3 pe=ro+rd*tn; vec3 nn=vec3(0.);
  if(tn==mi.x) nn.x=-sign(rd.x); else if(tn==mi.y) nn.y=-sign(rd.y); else nn.z=-sign(rd.z);
  vec3 rel=pe-c; vec3 d=h-abs(rel);
  float e=1.; if(nn.x!=0.) e=min(d.y,d.z); else if(nn.y!=0.) e=min(d.x,d.z); else e=min(d.x,d.y);
  float ndv=abs(dot(nn,rd)); float F=0.03+0.97*pow(1.-ndv,5.);
  vec3 refl=envMap(reflect(rd,nn),0.04,1.);
  float line=smoothstep(0.035,0.,e);
  vec2 q=(nn.x!=0.)?pe.zy:pe.xy;
  float sm=prints(q)*0.6+fbm(q*2.5)*0.25;
  float dust=step(0.996,hash(floor(q*170.)))*0.5;
  vec3 refl2=envMap(reflect(rd,nn),0.35,1.);
  return col*0.985+refl*F*0.55+refl2*sm*0.07+vec3(0.8,0.85,0.8)*dust*0.05+vec3(0.55,0.62,0.6)*line*(0.10+0.2*F);
}

void main(){
  float asp=uRes.x/uRes.y;
  vec2 nd=vec2(gl_FragCoord.x/uRes.x*2.-1.,gl_FragCoord.y/uRes.y*2.-1.-uShiftY);
  float dist=uSpan/(2.*TH*asp);
  vec3 ro=uTgt+dist*vec3(sin(uYaw)*cos(uPitch),sin(uPitch),cos(uYaw)*cos(uPitch));
  vec3 fw=normalize(uTgt-ro), rt=normalize(cross(fw,vec3(0,1,0))), up=cross(rt,fw);
  vec3 rd=normalize(fw+rt*nd.x*asp*TH+up*nd.y*TH);
  float pa=2.*TH/uRes.y;
  Lp=vec3(uSpot*5.5, 9.5, 5.5);

  vec2 hit=march(ro,rd);
  float t=hit.x; float id=hit.y;
  vec3 p=ro+rd*t;
  vec3 n=nrm(p);
  float fp=t*pa;
  vec3 K=keyDir();
  vec3 Ld=normalize(Lp-p);
  float cone=coneAt(p);

  if(uDebug>0.5){ oc=vec4(step(7.5,id)*step(id,8.5)*step(0.9,n.y)*step(-2.1,p.y)*step(p.y,-1.8),step(0.5,id)*step(id,1.5)*step(0.9,n.y)*step(1.9,p.y),(id<0.?1.:0.)+((n.x!=n.x||n.y!=n.y)?1.:0.),1.); return; }
  vec3 alb=vec3(.5); float metal=0.; float rough=.5; vec3 F0=vec3(.04);
  vec3 emis=vec3(0.); float beadA=0.; bool isBead=false; float spec_k=1.; bool wall=false; bool panel=false; float cavity=1.;

  float lodF=max(0.,log2(fp*384.));
  float lodD=max(0.,log2(fp*620.));
  vec2 fuv=vec2((p.x+4.)/8.,(1.95-p.y)/3.9);

  if(id<0.5){ // floor
    alb=plaster(p.xz*0.7,fp,vec3(0.30,0.285,0.265)); rough=0.4; spec_k=0.6;
  } else if(id>5.5&&id<6.5){ // wall
    alb=plaster(p.xy*0.6,fp,vec3(0.47,0.45,0.42)); rough=0.9; wall=true;
  } else if(id>7.5&&id<8.5){ // plinth
    vec2 q=abs(n.z)>0.6?p.xy:(abs(n.x)>0.6?p.zy:p.xz);
    float gr=fbm(q*3.)*0.5+fbm(q*26.)*0.3+fbm(q*90.)*0.12; float vein=smoothstep(0.03,0.0,abs(sin(q.x*2.2+q.y*1.4+fbm(q*1.6)*7.)))*0.5+smoothstep(0.02,0.0,abs(sin(q.x*-1.3+q.y*3.1+fbm(q*2.7)*9.)))*0.3; float fleck=step(0.985,hash(floor(q*140.)))*clamp(1.-fp*140.,0.,1.); float pore=step(0.97,hash(floor(q*260.+7.)))*clamp(1.-fp*260.,0.,1.);
    alb=vec3(0.40,0.385,0.36)*(0.80+0.4*gr)*(1.-0.22*vein)*(1.+0.04*(hash(floor(q*220.))-0.5)*clamp(1.-fp*220.,0.,1.))*(1.+0.5*fleck-0.4*pore);
    if(n.y>0.9&&p.y>-2.0&&p.x>3.9){ float m2=0.; m2+=smoothstep(0.07,0.045,length(p.xz-vec2(4.15,-0.1))); m2+=smoothstep(0.06,0.04,length(p.xz-vec2(4.3,0.2))); m2+=smoothstep(0.065,0.04,length(p.xz-vec2(4.4,-0.35))); m2+=smoothstep(0.05,0.03,length(p.xz-vec2(4.08,0.45))); m2+=smoothstep(0.055,0.035,length(p.xz-vec2(4.48,0.05))); alb=mix(alb,alb*0.55+vec3(0.06,0.06,0.04),clamp(m2,0.,1.)*0.6); }
    if(n.z>0.8&&p.z>0.85){ vec2 hq=p.xy-vec2(2.2,-3.7); float seam=smoothstep(0.012,0.0,abs(max(abs(hq.x)-0.42,abs(hq.y)-0.3))); alb*=1.-0.55*seam; alb=mix(alb,vec3(0.22,0.19,0.12),smoothstep(0.04,0.03,length(hq-vec2(0.3,0.)))); }
    rough=0.42; spec_k=0.7;
  } else if(id>0.5&&id<1.5){ // titanium housing
    F0=vec3(0.50,0.52,0.55); metal=1.; rough=0.36;
    float br=vn(vec2(p.x*2.5+p.z*3.,p.y*380.+p.z*380.));
    float brt=vn(vec2(p.x*380.+p.z*380.,p.z*2.5+p.y*3.));
    float fade=clamp(1.-fp*380.*0.7,0.,1.);
    bool top=abs(n.y)>0.7;
    float bs=top?brt:br;
    n=normalize(n+(top?vec3(0.,0.,1.):vec3(0.,1.,0.))*(bs-0.5)*0.16*fade+vec3(fbm(p.xy*1.7)-0.5,fbm(p.yz*1.7+3.)-0.5,0.)*0.05);
    F0*=0.88+0.2*bs*fade;
    // faded marks of balls lost before the tape, and a drip stain below the leak
    if(n.y>0.8&&p.y>1.9&&p.x>3.75){
      vec2 sq=p.xz; float m=0.;
      m+=smoothstep(0.075,0.05,length(sq-vec2(3.93,-0.18)));
      m+=smoothstep(0.06,0.04,length(sq-vec2(3.97,-0.4)));
      m+=smoothstep(0.05,0.03,length(sq-vec2(3.88,-0.72)));
      m+=smoothstep(0.045,0.03,length(sq-vec2(3.96,-0.95)));
      F0=mix(F0,F0*0.55+vec3(0.1,0.1,0.07),clamp(m,0.,1.)*0.55);
      F0*=1.-0.25*smoothstep(0.2,0.0,length(sq-vec2(3.8,-0.45)))*fbm(sq*14.);
    }
    if(abs(n.x)>0.8&&p.x>3.9&&p.y<1.95){
      float dr=smoothstep(0.03+0.015*vn(vec2(p.y*9.,2.)),0.0,abs(p.z+0.5-0.03*sin(p.y*7.)))*smoothstep(0.55,1.95,p.y);
      F0*=1.-0.5*dr;
    }
    // panel seams, louvres, hex screws, engraved edge lines
    vec3 g0=normalize(n);
    if(n.y>0.8&&p.y>1.9){
      float seam=smoothstep(0.012,0.0,min(min(abs(p.x+1.4),abs(p.x-1.6)),abs(p.z+1.1)));
      float inL=step(1.95,p.x)*step(p.x,3.3)*step(-1.95,p.z)*step(p.z,-0.8);
      float sl=fract(p.x*9.); float slot=inL*step(0.2,sl)*step(sl,0.62)*step(-1.9,p.z)*step(p.z,-0.85);
      F0*=1.-0.55*seam-0.8*slot;
      n=normalize(n+vec3((sl-0.4)*0.4*inL,0.,0.));
      for(int i=0;i<4;i++){ vec2 sc=vec2(i<2?-3.7:3.7,i%2==0?-0.3:-1.85); float dd=length(p.xz-sc);
        float hex=smoothstep(0.075,0.065,dd); F0=mix(F0,vec3(0.45,0.44,0.40),hex*0.7); F0*=1.-0.8*hex*smoothstep(0.012,0.0,min(abs(p.x-sc.x),abs(p.z-sc.y)))*step(dd,0.05); F0*=1.-0.5*smoothstep(0.085,0.075,dd)*step(0.065,dd); }
      float edge=smoothstep(0.01,0.0,abs(abs(p.z+1.1)-0.9))*step(abs(p.x),3.85); F0*=1.-0.35*edge;
    } else if(abs(n.x)>0.8&&abs(p.x)>3.9){
      float inL=step(-1.95,p.z)*step(p.z,-0.95)*step(-1.1,p.y)*step(p.y,1.05)*(p.x>0.?1.:0.);
      float sl=fract(p.y*8.); float slot=inL*step(0.25,sl)*step(sl,0.6);
      float seam=smoothstep(0.012,0.0,min(abs(p.z+1.1),min(abs(p.y-1.62),abs(p.y+1.62))));
      F0*=1.-0.8*slot-0.5*seam; n=normalize(n+vec3(0.,(sl-0.4)*0.4*inL,0.));
    }
    float scx=scr(p.xy*1.3+p.z*2.,fp); F0+=scx*0.22; rough+=scx*0.15;
    F0*=0.9+0.2*fbm(p.xy*0.9+p.z);                                            // uneven tarnish
    // wear: smudged, slightly rougher near edges handled by ao
    rough+= (fbm(p.xy*4.)-0.5)*0.12;
    panel=(abs(p.x-GX)<GHX&&abs(p.y)<WHY&&p.z<-0.37);
    if(panel){
      vec2 gu=vec2((p.x-(GX-GHX))/(2.*GHX),(WHY-p.y)/(2.*WHY));
      emis=textureLod(tGau,gu,lodF).rgb;
    } else if(n.z>0.5&&p.z>-0.3){
      vec4 f=textureLod(tFace,fuv,lodF);
      float e=exp2(lodF)/3072.;
      float gx=textureLod(tFace,fuv+vec2(e,0.),lodF).r-textureLod(tFace,fuv-vec2(e,0.),lodF).r;
      float gy=textureLod(tFace,fuv+vec2(0.,e*2.05),lodF).r-textureLod(tFace,fuv-vec2(0.,e*2.05),lodF).r;
      n=normalize(n+vec3(-gx,gy,0.)*1.1);
      if(f.g>0.5){ F0=vec3(0.44,0.45,0.33); rough=0.30; float pt=smoothstep(0.5,0.8,fbm(p.xy*8.)); F0=mix(F0,vec3(0.26,0.34,0.28),pt*0.5); }
      F0*=1.-0.75*f.r;
    }
  } else if(id>1.5&&id<2.5){ // brass
    F0=vec3(0.44,0.45,0.33); metal=1.; rough=0.30;
    float pt=smoothstep(0.45,0.8,fbm(p.xy*7.+p.z*3.));
    F0=mix(F0,vec3(0.28,0.42,0.36),pt*0.55);
    float sc=vn(vec2(p.x*260.,p.y*18.)); F0+=scr(p.xy*1.7,fp)*0.18; n=normalize(n+vec3(0.,(sc-0.5)*0.08,0.)*clamp(1.-fp*260.,0.,1.));
    rough+=pt*0.25;
  } else if(id>6.5&&id<7.5){ // cover
    F0=vec3(0.30,0.32,0.35); metal=1.; rough=0.34;
    float cy=coverY();
    vec2 cu=vec2((p.x-(WX-2.78))/5.56,(cy+0.55-p.y)/1.1);
    if(n.z>0.5){
      vec4 f=textureLod(tCov,cu,lodF);
      float e=exp2(lodF)/2135.;
      float gx=textureLod(tCov,cu+vec2(e,0.),lodF).r-textureLod(tCov,cu-vec2(e,0.),lodF).r;
      float gy=textureLod(tCov,cu+vec2(0.,e*5.06),lodF).r-textureLod(tCov,cu-vec2(0.,e*5.06),lodF).r;
      n=normalize(n+vec3(-gx,gy,0.)*1.0);
      if(f.g>0.5){ F0=vec3(0.44,0.45,0.33); rough=0.3; float pt=smoothstep(0.45,0.8,fbm(p.xy*8.)); F0=mix(F0,vec3(0.28,0.42,0.36),pt*0.75); }
      F0*=1.-0.8*f.r;
    }
    float bs=vn(vec2(p.x*380.,p.y*2.4)); n=normalize(n+vec3(0.,(bs-0.5)*0.12,0.)*clamp(1.-fp*380.*0.7,0.,1.));
  } else if(id>12.5){ // cloth tape
    float wv=0.5+0.5*sin(p.x*260.)*sin(p.y*260.+p.z*260.); float st=smoothstep(0.35,0.5,abs(fract(p.x*38.)-0.5));
    float fray=vn(p.xy*60.+p.z*20.);
    alb=mix(vec3(0.58,0.42,0.2),vec3(0.80,0.66,0.38),fray*0.6+0.35*wv); alb*=1.-0.35*st;
    alb*=0.86+0.2*fbm(p.xy*14.);
    alb=mix(alb,vec3(0.32,0.27,0.18),smoothstep(0.55,0.9,fbm(p.xy*9.+3.))*0.5);   // grime
    n=normalize(n+vec3(0.05*(wv-0.5),0.05*(wv-0.5),0.04*(fray-0.5)));
    rough=0.92; F0=vec3(0.03);
  } else if(id>11.5){ alb=vec3(0.035,0.036,0.04); rough=0.55; F0=vec3(0.04);
  } else if(id>10.5){ beadA=-1.; isBead=true;
  } else if(id>8.5&&id<9.5){ // glass beads
    float bi=0.,bdm=1e3,ba=0.;
    for(int i=0;i<36;i++){ float dd=length(p-uBead[i].xyz)-uBead[i].w; if(dd<bdm){ bdm=dd; ba=uBA[i]; } }
    beadA=ba; isBead=true;
  } else if(id>9.5&&id<10.5){ // printed paper label
    metal=0.; F0=vec3(0.04); rough=0.8;
    vec2 pu=vec2((p.x+2.8)/5.6,(-2.21-p.y)/0.72); float lodP=max(0.,log2(fp*400.));
    float fib=vn(vec2(pu.x*420.,pu.y*40.))*0.5+vn(vec2(pu.x*60.+3.,pu.y*500.))*0.5;
    vec3 paper=vec3(0.86,0.81,0.70)*(0.93+0.12*fib)*(0.96+0.06*fbm(pu*9.));
    alb=paper;
    if(n.z>0.5){
      vec4 f=textureLod(tPlq,pu,lodP);
      float e=exp2(lodP)/2240.;
      float gx=textureLod(tPlq,pu+vec2(e,0.),lodP).r-textureLod(tPlq,pu-vec2(e,0.),lodP).r;
      float gy=textureLod(tPlq,pu+vec2(0.,e*7.78),lodP).r-textureLod(tPlq,pu-vec2(0.,e*7.78),lodP).r;
      n=normalize(n+vec3(gx,-gy,0.)*0.35);                     // letterpress bite
      alb=mix(paper,vec3(0.06,0.055,0.05)*(0.9+0.2*fib),f.r*0.96);
      if(f.g>0.5){ F0=vec3(0.06); rough=0.12; alb=mix(alb,vec3(0.75,0.74,0.7),0.35); }   // clear adhesive corners
    }
  } else { // drums
    vec2 dv=vec2(p.z-ZC,p.y);
    float phi=atan(dv.y,dv.x);
    int idx=-1; float cx=0.;
    for(int i=0;i<7;i++){ if(abs(p.x-uDX[i])<0.31){ idx=i; cx=uDX[i]; } }
    bool sep=(abs(p.x-uSX[0])<0.13)||(abs(p.x-uSX[1])<0.13);
    vec3 tn=vec3(0.,sin(phi),cos(phi));
    if(idx<0){ // sleeves, flanges and separators: brass
      F0=vec3(0.44,0.45,0.33); metal=1.; rough=0.32;
      if(sep){
        vec4 f=textureLod(tFace,fuv,lodF);
        float e=exp2(lodF)/3072.;
        float gx=textureLod(tFace,fuv+vec2(e,0.),lodF).r-textureLod(tFace,fuv-vec2(e,0.),lodF).r;
        float gy=textureLod(tFace,fuv+vec2(0.,e*2.05),lodF).r-textureLod(tFace,fuv-vec2(0.,e*2.05),lodF).r;
        n=normalize(n+vec3(-gx,gy,0.)*1.1); F0*=1.-0.8*f.r;
      }
      float pt=smoothstep(0.45,0.8,fbm(p.xy*9.)); F0=mix(F0,vec3(0.28,0.42,0.36),pt*0.75);
    } else {
      float s=-phi/(2.*PI)*10.+uAng[idx];
      float across=(p.x-cx)/0.62+0.5;
      float blur=min(abs(uVel[idx])*0.0013,0.3);
      vec4 acc=vec4(0.);
      for(int k=-2;k<=2;k++){
        float o=float(k)*blur*0.5;
        acc+=textureLod(tDig,vec2(across,fract((s+0.5)/10.+o)),lodD);
      }
      acc/=5.;
      float e=1./384.;
      float ar=fract((s+0.5)/10.);
      float gA=textureLod(tDig,vec2(across+e,ar),lodD).g-textureLod(tDig,vec2(across-e,ar),lodD).g;
      float gV=textureLod(tDig,vec2(across,fract(ar+e*0.1)),lodD).g-textureLod(tDig,vec2(across,fract(ar-e*0.1)),lodD).g;
      vec3 tu=vec3(0.,cos(phi),-sin(phi)); // toward increasing phi (up the drum)
      n=normalize(n+vec3(gA,0.,0.)*0.5+tu*gV*0.5*(-1.));
      float ink=acc.r;
      alb=mix(vec3(0.74,0.755,0.76),vec3(0.035,0.04,0.045),ink);
      float gap=smoothstep(0.285,0.305,abs(p.x-cx));
      alb*=1.-0.65*gap; alb*=1.-0.35*acc.b;
      rough=mix(0.28,0.5,ink); spec_k=1.-0.8*ink;
      // age: faint soot at the lower edge of the window
      alb*=0.94+0.06*fbm(p.xy*20.);
    }
  }

  // ---- lighting ----
  vec3 col;
  if(isBead){
    float ndv=max(dot(n,-rd),0.);
    vec3 fresh=vec3(0.75,1.0,0.18), old=vec3(0.36,0.43,0.48);
    vec3 tint=fresh;
    float nl=max(dot(n,Ld),0.)*cone;
    vec3 refl=envMap(reflect(rd,n),0.05,cone);
    float F=0.06+0.94*pow(1.-ndv,4.);
    float spc=pow(max(dot(reflect(-Ld,n),-rd),0.),48.)*cone;
    col=tint*(0.30+0.95*nl+0.25*ndv)*(0.5+0.5*smoothstep(0.0,0.45,ndv))+refl*F*0.7+vec3(1.)*spc*1.2;
    if(beadA<0.){ vec3 bf=vec3(0.62,0.50,0.30); vec3 e2=envMap(reflect(rd,n),0.22,cone); col=e2*bf*1.25; }
  } else if(wall){
    vec3 c0=vec3(0.,0.,0.);
    float sp=cone;
    vec2 d=p.xy-vec2(uSpot*1.2,-0.4);
    float pool=exp(-dot(d,d)/60.);
    float sh=sshadow(p+n*0.01,Ld,16.);
    float lit=0.30+0.55*pool+0.7*sp*mix(0.35,1.,sh);
    col=alb*lit*vec3(1.0,0.985,0.95);
  } else if(panel){
    float ao=calcAO(p,n);
    col=emis*(1.05+0.35*uGlow)*(0.6+0.4*ao);
  } else {
    float sh=sshadow(p+n*0.004,Ld,18.);
    float ao=calcAO(p,n);
    float ndv=max(dot(n,-rd),0.);
    vec3 F=F0+(1.-F0)*pow(1.-ndv,5.);
    vec3 r=reflect(rd,n);
    float kv=sh*cone;
    float cvx=clamp((map(p+n*0.05).x-0.05)*28.,0.,1.);
    if(metal>0.5){ F0=mix(F0,min(F0*1.35+0.07,vec3(1.)),cvx); F=F0+(1.-F0)*pow(1.-ndv,5.); F*=mix(0.55,1.,ao); rough=min(1.,rough+cvx*0.12); }
    vec3 spec=envMap(r,rough,kv)*F*spec_k*mix(0.4,1.,ao);
    vec3 diff=vec3(0.);
    if(metal<0.5){
      float nl=max(dot(n,Ld),0.);
      vec3 hemi=mix(vec3(0.20,0.19,0.18),vec3(0.50,0.52,0.55),0.5+0.5*n.y)+0.16*max(dot(n,normalize(vec3(0.3,0.1,1.))),0.);
      diff=alb*(vec3(1.0,0.96,0.9)*2.6*nl*sh*cone+hemi*ao+vec3(0.5,0.58,0.7)*0.35*max(dot(n,normalize(vec3(-0.7,0.2,0.7))),0.)*ao)*(1.-F)+vec3(0.5,0.62,0.85)*pow(1.-ndv,3.)*0.22*ao;
    }
    // faint gauge light on its own frame only
    vec3 gp=vec3(GX,0.,0.2); vec3 gl=gp-p; float gd=length(gl);
    float spill=max(dot(n,gl/gd),0.)/(1.+gd*gd*6.)*(0.10+0.25*uGlow);
    col=diff+spec+vec3(0.78,1.0,0.3)*spill*(metal>0.5?F0*0.8:alb);
  }

  // glass riser and the glass run of 14 slots, analytic
  {
    vec2 o=ro.xz-vec2(-4.38,-0.5); vec2 d=rd.xz; float a=dot(d,d), bq=dot(o,d), cq=dot(o,o)-0.15*0.15; float h=bq*bq-a*cq;
    if(h>0.&&a>1e-6){ float tg=(-bq-sqrt(h))/a; vec3 pg=ro+rd*tg;
      if(tg>0.&&tg<t&&pg.y>-1.55&&pg.y<2.4){ vec3 ng=normalize(vec3(pg.x+4.38,0.,pg.z+0.5)); float F=0.04+0.96*pow(1.-abs(dot(rd,ng)),4.);
        col=col*0.84+envMap(reflect(rd,ng),0.03,cone*0.9+0.1)*F*2.4+vec3(0.55,0.62,0.6)*smoothstep(0.35,0.0,abs(dot(rd,ng)))*0.35; } }
    vec2 o2=ro.yz-vec2(2.55,-0.5); vec2 d2=rd.yz; float a2=dot(d2,d2), b2=dot(o2,d2), c2=dot(o2,o2)-0.16*0.16; float h2=b2*b2-a2*c2;
    if(h2>0.&&a2>1e-6){ float tg=(-b2-sqrt(h2))/a2; vec3 pg=ro+rd*tg;
      if(tg>0.&&tg<t&&pg.x>-4.2&&pg.x<3.47){ vec3 ng=normalize(vec3(0.,pg.y-2.55,pg.z+0.5)); float F=0.04+0.96*pow(1.-abs(dot(rd,ng)),4.);
        col+=vec3(1.0,0.92,0.6)*smoothstep(0.085,0.0,abs(pg.x-3.4-0.04*sin(pg.y*38.+pg.z*26.)))*3.2;   // the crack
        col=col*0.84+envMap(reflect(rd,ng),0.03,cone*0.9+0.1)*F*2.4+vec3(0.55,0.62,0.6)*smoothstep(0.35,0.0,abs(dot(rd,ng)))*0.35; } }
  }
  // glass over the drum window and the gauge
  if(rd.z<0.){
    float tg=(0.02-ro.z)/rd.z;
    vec3 pg=ro+rd*tg;
    bool inW=abs(pg.x-WX)<WHX-0.02&&abs(pg.y)<WHY-0.02;
    bool inG=abs(pg.x-GX)<GHX-0.02&&abs(pg.y)<WHY-0.02;
    if((inW||inG)&&t>tg){
      float cxg=inW?WX:GX;
      vec3 ng=normalize(vec3(-(pg.x-cxg)*0.03,-pg.y*0.06,1.));
      float ndv=abs(dot(rd,ng)); float F=0.04+0.96*pow(1.-ndv,5.);
      vec3 rf=envMap(reflect(rd,ng),0.03,cone*0.9+0.1);
      col=col*0.94+rf*F*(inG?1.5:1.1);
    }
  }
  // small halo on the gauge, no more
  {
    vec3 gp=vec3(GX,0.,0.1); float tt=dot(gp-ro,rd);
    float dd=length(cross(rd,gp-ro));
    float h=exp(-dd*dd*14.)*(0.05+0.07*uGlow)*step(tt,t+0.3);
    col+=vec3(0.80,1.0,0.35)*h;
  }
  {
    float hl=0.;
    for(int i=0;i<36;i++){ vec3 bp=uBead[i].xyz; float tt=dot(bp-ro,rd); float dd=length(cross(rd,bp-ro)); hl+=exp(-dd*dd*70.)*max(1.-uBA[i],0.)*step(0.,uBA[i])*step(tt,t+0.3)*step(0.02,uBead[i].w)*step(-40.,bp.y); }
    col+=vec3(0.80,1.0,0.35)*min(hl,1.4)*0.07;
    float lum=dot(col,vec3(0.33)); col+=col*max(lum-0.75,0.)*0.25;   // gentle bloom on hot highlights
  }
  { vec3 dq=p-vec3(3.78,2.4,-0.5); col*=1.+0.8*exp(-dot(dq,dq)*0.45); }   // a small local light on the repair
  col=vitrine(ro,rd,t,col);

  // exposure, vignette, tone, grain
  vec2 vq=gl_FragCoord.xy/uRes*2.-1.;
  col*=1.-0.22*dot(vq,vq)*0.6;
  col*=mix(1.,0.82,uCollapse);
  col=col*(2.51*col+0.03)/(col*(2.43*col+0.59)+0.14);
  col=pow(clamp(col,0.,1.),vec3(1./2.2));
  float g=hash(gl_FragCoord.xy+vec2(floor(uTime*24.)*7.13,0.))-0.5;
  col+=g*0.045*(1.-uStill*0.0);
  oc=vec4(col,1.);
}`;

  /* ---------------- textures drawn at load ---------------- */
  var MONO = '"Archivo", system-ui, sans-serif';
  var SANS = '"Archivo", system-ui, sans-serif';

  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function drawDigits() {
    var W = 384, H = 384, c = cv(W, H * 10), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H * 10);
    x.globalCompositeOperation = 'lighter';
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    // R ink, G soft height, B cell seam
    for (var d = 0; d < 10; d++) {
      var cy = d * H + H * 0.5;
      x.font = '700 ' + Math.round(H * 0.62) + 'px ' + SANS;
      x.fillStyle = '#f00'; x.fillText(String(d), W / 2, cy + H * 0.22);
      x.save(); x.filter = 'blur(5px)'; x.fillStyle = '#0f0'; x.fillText(String(d), W / 2, cy + H * 0.22); x.restore();
      x.fillStyle = '#00f'; x.fillRect(0, d * H - 2, W, 4);
    }
    return c;
  }

  function drawFace() {
    var S = 384, c = cv(3072, 1498), x = c.getContext('2d');
    var FX = function (v) { return (v + 4) * S; }, FY = function (v) { return (1.95 - v) * S; };
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'lighter';
    function brass(x0, y0, x1, y1) { x.fillStyle = '#0f0'; x.fillRect(FX(x0), FY(y1), (x1 - x0) * S, (y1 - y0) * S); }
    function frame(x0, y0, x1, y1) { x.strokeStyle = '#f00'; x.lineWidth = 3; x.strokeRect(FX(x0), FY(y1), (x1 - x0) * S, (y1 - y0) * S); }
    function text(s, px, py, size, align, w, sp) {
      x.fillStyle = '#f00'; x.textAlign = align || 'left';
      x.font = (w || 600) + ' ' + Math.round(size * S) + 'px ' + MONO;
      x.letterSpacing = (sp || 0) + 'px';
      x.fillText(s, FX(px), FY(py));
    }
    function line(x0, y0, x1, y1, w) { x.strokeStyle = '#f00'; x.lineWidth = w || 2.5; x.beginPath(); x.moveTo(FX(x0), FY(y0)); x.lineTo(FX(x1), FY(y1)); x.stroke(); }
    // one small tally group of five, below the gauge section
    [0, 1, 2, 3].forEach(function (i) { line(-1.7 + i * 0.07, -1.0, -1.7 + i * 0.07, -1.24, 4); });
    line(-1.77, -1.2, -1.43, -1.04, 4);
    // labels directly above the two displays
    text('GITHUB \u00b7 14 DAYS', -3.02, 0.73, 0.1, 'center', 700, 3);
    text('CLONOMETER \u00b7 FOREVER', 0.75, 0.73, 0.1, 'center', 700, 4);
    // panel seams and engraved edge lines
    line(-3.85, 0.82, 3.85, 0.82, 2); line(-3.85, -0.82, 3.85, -0.82, 2); line(-2.15, -1.75, -2.15, 1.75, 2.5);
    line(-3.85, 1.7, 3.85, 1.7, 1.5); line(-3.85, -1.7, 3.85, -1.7, 1.5);
    // small vents
    for (var vr = 0; vr < 3; vr++) for (var vi = 0; vi < 9; vi++) { x.fillStyle = '#f00'; x.fillRect(FX(1.9 + vi * 0.15), FY(1.46 - vr * 0.1), 0.09 * S, 0.035 * S); }
    // two small gauges
    [[-1.4, 1.3], [-0.95, 1.3]].forEach(function (g) {
      x.strokeStyle = '#f00'; x.lineWidth = 3; x.beginPath(); x.arc(FX(g[0]), FY(g[1]), 0.1 * S, 0, 7); x.stroke();
      for (var tk = 0; tk < 7; tk++) { var an = Math.PI * (1.1 + tk * 0.13); line(g[0] + Math.cos(an) * 0.075, g[1] - Math.sin(an) * 0.075, g[0] + Math.cos(an) * 0.095, g[1] - Math.sin(an) * 0.095, 2); }
      line(g[0], g[1], g[0] + 0.05, g[1] + 0.05, 3);
    });
    // stamped serial plate
    brass(1.9, -1.58, 3.5, -1.12); frame(1.9, -1.58, 3.5, -1.12);
    text('SERIAL No. 0001', 2.7, -1.32, 0.075, 'center', 700, 3);
    text('CLONOMETER', 2.7, -1.5, 0.06, 'center', 600, 4);
    // gauge plate
    brass(-3.72, -1.58, -2.32, -0.80); frame(-3.72, -1.58, -2.32, -0.80);
    text('GITHUB KEEPS', -3.02, -1.02, 0.1, 'center', 700, 3);
    text('14 DAYS', -3.02, -1.36, 0.17, 'center', 800, 4);
    // upper strip, shown when the cover is down
    text('CLONOMETER', -3.2, 1.3, 0.2, 'left', 800, 14);
    text('No. 0001', 1.7, 1.3, 0.2, 'right', 700, 6);
    line(-3.3, 1.06, 1.82, 1.06, 2.5);
    // corner screws
    [[-3.62, 1.56], [3.62, 1.56], [-3.62, -1.56], [3.62, -1.56]].forEach(function (s, i) {
      x.fillStyle = '#0f0'; x.beginPath(); for (var hv = 0; hv < 6; hv++) { var ha = hv * Math.PI / 3 + 0.3; x.lineTo(FX(s[0]) + Math.cos(ha) * 0.095 * S, FY(s[1]) + Math.sin(ha) * 0.095 * S); } x.closePath(); x.fill();
      var a = 0.6 + i * 0.9; x.strokeStyle = '#f00'; x.lineWidth = 5; x.beginPath();
      x.moveTo(FX(s[0]) - Math.cos(a) * 0.07 * S, FY(s[1]) - Math.sin(a) * 0.07 * S); x.lineTo(FX(s[0]) + Math.cos(a) * 0.07 * S, FY(s[1]) + Math.sin(a) * 0.07 * S); x.stroke();
    });
    // separators between digit groups: brass sleeves with an engraved comma
    SEP_X.forEach(function (sx) {
      brass(sx - 0.13, -0.5, sx + 0.13, 0.5);
      x.fillStyle = '#f00'; x.textAlign = 'center'; x.font = '800 ' + Math.round(0.5 * S) + 'px ' + SANS;
      x.fillText(',', FX(sx), FY(-0.1));
    });
    return c;
  }

  function drawCover() {
    var S = 384, c = cv(2135, 422), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'lighter';
    var groups = 9, gw = 0.5, pitch = 5.56 / groups;
    for (var g = 0; g < groups; g++) {
      var cx = (g + 0.5) * pitch * S, top = 0.17 * S, h = 0.5 * S, bw = 0.05 * S;
      x.fillStyle = '#0f0';
      for (var b = 0; b < 4; b++) x.fillRect(cx - 0.19 * S + b * 0.127 * S - bw / 2, top, bw, h);
      x.save(); x.translate(cx, top + h / 2); x.rotate(-0.62); x.fillRect(-0.3 * S, -0.025 * S, 0.6 * S, 0.05 * S); x.restore();
    }
    x.fillStyle = '#f00'; x.fillRect(0.2 * S, 0.08 * S, c.width - 0.4 * S, 3);
    x.fillRect(0.2 * S, 0.84 * S, c.width - 0.4 * S, 3);
    x.textAlign = 'center'; x.font = '700 ' + Math.round(0.068 * S) + 'px ' + MONO; x.letterSpacing = '6px';
    x.fillText('THE TOTAL ONLY GOES UP', c.width / 2, 0.97 * S);
    return c;
  }

  function drawPlaque() {
    var c = cv(2240, 288), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'lighter';
    x.strokeStyle = '#f00'; x.lineWidth = 3; x.strokeRect(22, 22, c.width - 44, c.height - 44);
    x.strokeRect(34, 34, c.width - 68, c.height - 68);
    x.fillStyle = '#f00'; x.textAlign = 'left';
    x.font = '800 96px ' + SANS; x.letterSpacing = '-1px'; x.fillText('clonometer', 100, 120);
    x.font = '400 62px ' + SANS; x.letterSpacing = '0px'; x.fillText('In continuous service since day 1', 100, 186);
    x.fillRect(100, 206, c.width - 200, 3);
    x.font = '600 46px ' + SANS; x.letterSpacing = '5px'; x.fillText('TITANIUM, BRASS, GLASS, CERAMIC, 2026', 100, 252);
    x.textAlign = 'right'; x.fillText('ACC. NO. 0001', c.width - 100, 252);
    x.fillStyle = '#0f0'; x.textAlign = 'left';
    [[0, 0, 1, 1], [c.width, 0, -1, 1], [0, c.height, 1, -1], [c.width, c.height, -1, -1]].forEach(function (m) {
      x.beginPath(); x.moveTo(m[0], m[1]); x.lineTo(m[0] + m[2] * 90, m[1]); x.lineTo(m[0], m[1] + m[3] * 90); x.closePath(); x.fill();
    });
    return c;
  }
  var gauge = { c: cv(512, 410) };
  function drawGauge(win) {
    var x = gauge.c.getContext('2d'), w = 512, h = 410;
    var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#dcff4e'); g.addColorStop(1, '#bff01a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0d1114';
    x.font = '700 30px ' + MONO; x.letterSpacing = '4px'; x.textAlign = 'left'; x.fillText('14 DAYS', 30, 58);
    x.textAlign = 'right'; x.fillText('GITHUB', w - 30, 58);
    var sum = win.reduce(function (a, b) { return a + b; }, 0);
    x.letterSpacing = '0px'; x.textAlign = 'left'; x.font = '800 118px ' + SANS;
    x.fillText(sum.toLocaleString('en-US'), 26, 190);
    var mx = Math.max.apply(null, win.concat([1])), n = 16, bw = (w - 60) / n;
    for (var i = 0; i < win.length; i++) { var bh = 8 + 100 * (win[i] / mx); x.fillRect(30 + i * bw + 2, h - 36 - bh, bw - 4, bh); }
    x.fillRect(30, h - 30, w - 60, 3);
    x.strokeStyle = 'rgba(13,17,20,.5)'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
  }

  var DX = [], SEP_X = [];
  (function () {
    var start = 0.75 - 2.43, cur = start, order = ['d', 's', 'd', 'd', 'd', 's', 'd', 'd', 'd'];
    order.forEach(function (k) {
      if (k === 'd') { DX.push(cur + 0.31); cur += 0.62; } else { SEP_X.push(cur + 0.13); cur += 0.26; }
    });
  })();

  /* ---------------- gl plumbing ---------------- */
  function create(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); return null; }
    gl.useProgram(pr);
    var U = {}; ['uRes', 'uTime', 'uTgt', 'uSpan', 'uYaw', 'uPitch', 'uShiftY', 'uSpot', 'uCover', 'uCollapse', 'uGlow', 'uStill', 'uAng[0]', 'uVel[0]', 'uDX[0]', 'uSX[0]', 'uTrap', 'uKeep', 'uDebug', 'uBead[0]', 'uBA[0]', 'tDig', 'tFace', 'tCov', 'tGau', 'tPlq']
      .forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    var aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    function tex(unit, canvasEl, wrapT) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasEl);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT || gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return t;
    }
    function upload(unit, t, canvasEl) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasEl); gl.generateMipmap(gl.TEXTURE_2D); }

    drawGauge(opts.win || [1]);
    var tDig = tex(0, drawDigits(), gl.REPEAT), tFace = tex(1, drawFace()), tCov = tex(2, drawCover()), tGau = tex(3, gauge.c);
    var tPlq = tex(4, drawPlaque());
    gl.uniform1i(U.tPlq, 4); gl.uniform1i(U.tDig, 0); gl.uniform1i(U.tFace, 1); gl.uniform1i(U.tCov, 2); gl.uniform1i(U.tGau, 3);
    gl.uniform1fv(U['uDX[0]'], new Float32Array(DX));
    gl.uniform1fv(U['uSX[0]'], new Float32Array(SEP_X));

    var S = {
      reduce: !!opts.reduce, scroll: 0, scrollS: 0, collapse: false, cov: 0, cam: 0, glow: 0,
      drums: [], scale: 1, w: 1, h: 1, running: false, visible: true, onFrame: null, lastCam: null,
      still: !!opts.reduce
    };
    for (var i = 0; i < 7; i++) S.drums.push({ a: 0, v: 0, tg: 0, k: 100, t0: 0 });

    var portrait = function () { return canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.9; };
    var KF = {
      land: [
        { p: 0, t: [-0.1, -0.2, 0], span: 15.6, yaw: 0.10, pit: 0.19, sh: -0.17 },
        { p: 0.36, t: [-1.0, -0.15, 0], span: 7.6, yaw: 0.50, pit: 0.15, sh: -0.04 },
        { p: 0.70, t: [-0.6, -0.5, 0], span: 6.4, yaw: -0.40, pit: 0.12, sh: -0.04 },
        { p: 1, t: [2.5, 0, 0], span: 4.8, yaw: -0.10, pit: 0.08, sh: -0.04 }
      ],
      port: [
        { p: 0, t: [-0.1, -1.0, 0], span: 10.2, yaw: 0.12, pit: 0.17, sh: -0.3 },
        { p: 0.36, t: [-1.5, -0.1, 0], span: 5.0, yaw: 0.50, pit: 0.15, sh: 0.0 },
        { p: 0.70, t: [-0.8, -0.4, 0], span: 4.6, yaw: -0.42, pit: 0.12, sh: 0.0 },
        { p: 1, t: [2.8, 0, 0], span: 3.5, yaw: -0.10, pit: 0.08, sh: 0.0 }
      ],
      colLand: { t: [3.0, 0, 0], span: 3.5, yaw: -0.14, pit: 0.06, sh: -0.04 },
      colPort: { t: [3.0, 0, 0], span: 2.9, yaw: -0.12, pit: 0.06, sh: 0.0 }
    };
    var sm = function (a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
    function lerpK(a, b, f) {
      return { t: [0, 1, 2].map(function (i) { return a.t[i] + (b.t[i] - a.t[i]) * f; }), span: a.span + (b.span - a.span) * f, yaw: a.yaw + (b.yaw - a.yaw) * f, pit: a.pit + (b.pit - a.pit) * f, sh: a.sh + (b.sh - a.sh) * f };
    }
    function camAt(p) {
      var K = portrait() ? KF.port : KF.land, i = 0;
      while (i < K.length - 2 && p > K[i + 1].p) i++;
      var f = sm(K[i].p, K[i + 1].p, p);
      return lerpK(K[i], K[i + 1], f);
    }
    S.project = function (v) {
      var c = S.lastCam; if (!c) return null;
      var asp = S.cssW / S.cssH, dist = c.span / (2 * 0.2493 * asp);
      var ro = [c.t[0] + dist * Math.sin(c.yaw) * Math.cos(c.pit), c.t[1] + dist * Math.sin(c.pit), c.t[2] + dist * Math.cos(c.yaw) * Math.cos(c.pit)];
      var fw = norm(sub(c.t, ro)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw), d = sub(v, ro);
      var z = dot(d, fw); if (z <= 0.01) return null;
      var xn = dot(d, rt) / z / (0.2493 * asp), yn = dot(d, up) / z / 0.2493 + c.sh;
      return { x: (xn + 1) / 2 * S.cssW, y: (1 - yn) / 2 * S.cssH };
    };
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function norm(a) { var l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      S.cssW = canvas.clientWidth || window.innerWidth; S.cssH = canvas.clientHeight || window.innerHeight;
      S.w = Math.max(2, Math.round(S.cssW * dpr * S.scale)); S.h = Math.max(2, Math.round(S.cssH * dpr * S.scale));
      canvas.width = S.w; canvas.height = S.h; gl.viewport(0, 0, S.w, S.h);
      if (typeof touched !== 'undefined' && !touched && tg) { tg = baseCam(); }
      S.dirty = true;
    }

    var clock = 0, lastT = 0, slow = 0, fast = 0, frameSkip = 0;
    function physics(dt) {
      var moving = false;
      for (var i = 0; i < 7; i++) {
        var d = S.drums[i];
        if (clock < d.t0) { moving = true; continue; }
        var steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
        for (var s = 0; s < steps; s++) {
          var zeta = 0.72, c = 2 * zeta * Math.sqrt(d.k);
          d.v += (d.k * (d.tg - d.a) - c * d.v) * h; d.a += d.v * h;
        }
        if (Math.abs(d.tg - d.a) < 0.0015 && Math.abs(d.v) < 0.01) { d.a = d.tg; d.v = 0; } else moving = true;
      }
      return moving;
    }

    var interacting = 0, quietSince = 0;
    function shiftOf() { return portrait() ? -0.15 : -0.255; }
    function setUniforms(cc, now, dbg) {
      gl.uniform2f(U.uRes, S.w, S.h); gl.uniform1f(U.uTime, S.reduce ? 3.7 : now / 1000);
      gl.uniform3f(U.uTgt, cc.t[0], cc.t[1], cc.t[2]); gl.uniform1f(U.uSpan, cc.span); gl.uniform1f(U.uYaw, cc.yaw); gl.uniform1f(U.uPitch, cc.pit); gl.uniform1f(U.uShiftY, cc.sh);
      var drift = S.reduce ? 0 : Math.sin(now / 1000 * 0.25) * 0.12;
      gl.uniform1f(U.uSpot, -0.55 + drift); gl.uniform1f(U.uCover, 0); gl.uniform1f(U.uCollapse, 0); gl.uniform1f(U.uGlow, S.glow); gl.uniform1f(U.uStill, S.reduce ? 1 : 0);
      var A = new Float32Array(7), V = new Float32Array(7);
      for (var i = 0; i < 7; i++) { A[i] = S.drums[i].a; V[i] = S.drums[i].v; }
      gl.uniform1fv(U['uAng[0]'], A); gl.uniform1fv(U['uVel[0]'], V);
      gl.uniform1f(U.uTrap, S.trap); gl.uniform1f(U.uKeep, 0); gl.uniform1f(U.uDebug, dbg ? 1 : 0);
      var pk = S.packBeads(); gl.uniform4fv(U['uBead[0]'], pk[0]); gl.uniform1fv(U['uBA[0]'], pk[1]);
    }
    function frame(now) {
      S.raf = 0;
      if (!S.running) return;
      var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now; clock += dt;
      var anim = false;
      if (physics(dt)) anim = true;
      if (!S.reduce && S.stepBeads(dt, now)) anim = true;
      S.glow *= Math.pow(0.4, dt); if (S.glow < 0.01) S.glow = 0; else anim = true;
      // the camera first, so a moving camera always counts as animation
      if (!cur) { resetCam(); cur = { tx: tg.tx, ty: tg.ty, span: tg.span, yaw: tg.yaw, pit: tg.pit }; }
      var kf = S.reduce ? 1 : 1 - Math.exp(-dt * 9), camMoving = false;
      ['tx', 'ty', 'span', 'yaw', 'pit'].forEach(function (k) { var d = tg[k] - cur[k]; if (Math.abs(d) > 1e-4) { cur[k] += d * kf; camMoving = true; } else cur[k] = tg[k]; });
      if (camMoving || interacting) { anim = true; quietSince = now; }
      if (!anim && !S.dirty && !S.reduce) { frameSkip ^= 1; if (frameSkip) { schedule(); return; } }
      if (!anim && !S.dirty && S.reduce) return;
      S.dirty = false;
      var cc = { t: [cur.tx, cur.ty, 0], span: cur.span, yaw: cur.yaw, pit: cur.pit, sh: shiftOf() };
      S.lastCam = cc;
      setUniforms(cc, now, false);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      S.frames = (S.frames || 0) + 1;
      // adaptive resolution: never while the camera moves or the pointer is down, so a pose never changes scale mid-move
      var el = dt * 1000, target = anim ? 16.7 : 33.3;
      if (el > target * 1.6) { slow++; fast = 0; } else if (el < target * 1.15) { fast++; slow = 0; } else { slow = 0; fast = 0; }
      if (!camMoving && !interacting && now - quietSince > 800) {
        if (slow > 24 && S.scale > 0.5) { S.scale = Math.max(0.5, S.scale * 0.85); slow = 0; resize(); }
        else if (fast > 360 && S.scale < 1) { S.scale = Math.min(1, S.scale * 1.12); fast = 0; resize(); }
      }
      if (!S.reduce || anim) schedule();
    }
    // render fixed poses with a flat-colour debug pass and check that straight edges stay straight
    S.selfCheck = function () {
      var poses = [
        { tx: 0.1, ty: -0.06, span: 13.1, yaw: 0.08, pit: 0.15 }, { tx: 0.1, ty: -0.06, span: 13.1, yaw: 0.9, pit: 0.3 },
        { tx: 0.1, ty: 0.3, span: 13.4, yaw: -0.9, pit: 0.5 }, { tx: -1.5, ty: -0.5, span: 8, yaw: 0.4, pit: 0.2 },
        { tx: 2, ty: -1, span: 6, yaw: -0.5, pit: 0.7 },
        // the extreme allowed poses: no void or seam may show
        { tx: 0, ty: 0.3, span: 15, yaw: 1.17, pit: 1.05, ext: 1 }, { tx: 0, ty: 0.3, span: 15, yaw: -1.17, pit: -0.08, ext: 1 },
        { tx: 2.5, ty: 1.8, span: 15, yaw: 1.17, pit: 0.5, ext: 1 }, { tx: -2.5, ty: -1.2, span: 5, yaw: -1.17, pit: 1.05, ext: 1 },
        { tx: 2.5, ty: -1.2, span: 5, yaw: 1.17, pit: -0.08, ext: 1 }, { tx: -2.5, ty: 1.8, span: 15, yaw: 0, pit: -0.08, ext: 1 },
        { tx: 0, ty: 0.3, span: 15, yaw: 0, pit: 1.05, ext: 1 }
      ];
      var out = [], W = S.w, H = S.h, buf = new Uint8Array(W * H * 4);
      poses.forEach(function (p) {
        var cc = { t: [p.tx, p.ty, 0], span: p.span, yaw: p.yaw, pit: p.pit, sh: shiftOf() };
        setUniforms(cc, 0, true); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        var res = { pose: p, lines: [] };
        var voids = 0; for (var q = 2; q < buf.length; q += 4) if (buf[q] > 128) voids++;
        res.void = voids; res.voidPass = voids === 0;
        if (p.ext) { out.push(res); return; }
        [0, 1].forEach(function (ch) {           // 0: plinth cap top, 1: housing top; check the lower boundary of each mask
          var pts = [];
          for (var x = Math.floor(W * 0.3); x < W * 0.7; x += Math.max(1, Math.floor(W / 120))) {
            for (var y = 0; y < H; y++) { if (buf[((y * W) + x) * 4 + ch] > 128) { pts.push([x, y]); break; } }   // gl rows count up from the bottom: first hit = lower boundary
          }
          if (pts.length < 8) { res.lines.push({ ch: ch, n: pts.length, skipped: true }); return; }
          function fit(a, b) {            // least squares line through pts[a..b), worst deviation
            var n = b - a, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
            for (i = a; i < b; i++) { sx += pts[i][0]; sy += pts[i][1]; sxx += pts[i][0] * pts[i][0]; sxy += pts[i][0] * pts[i][1]; }
            var den = n * sxx - sx * sx, m = den ? (n * sxy - sx * sy) / den : 0, b0 = (sy - m * sx) / n, w = 0;
            for (i = a; i < b; i++) w = Math.max(w, Math.abs(pts[i][1] - (m * pts[i][0] + b0)));
            return w;
          }
          // an edge pair seen in perspective makes at most one corner: the boundary must be one or two straight segments
          var best = fit(0, pts.length), segs = 1;
          for (var s = 4; s < pts.length - 4; s++) { var w2 = Math.max(fit(0, s), fit(s, pts.length)); if (w2 < best) { best = w2; segs = 2; } }
          res.lines.push({ ch: ch, n: pts.length, segments: segs, maxDevPx: +best.toFixed(2), pass: best <= 1.6 + H / 500 });
        });
        out.push(res);
      });
      gl.uniform1f(U.uDebug, 0); S.invalidate();
      return out;
    };
    function schedule() { if (!S.raf && S.running) S.raf = requestAnimationFrame(frame); }
    S.invalidate = function () { S.dirty = true; if (S.running) schedule(); };
    S.start = function () { if (S.running) return; S.running = true; lastT = performance.now(); S.invalidate(); };
    S.stop = function () { S.running = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; };

    S.setScroll = function (p) { S.scroll = p; S.invalidate(); };
    S.setCollapsed = function (b) { S.collapse = b; S.invalidate(); };
    
    S.setDigits = function (digits, intro) {
      for (var i = 0; i < 7; i++) {
        var d = S.drums[i];
        if (intro) { var turns = 1 + i; d.a = digits[i] - 10 * turns; d.tg = digits[i]; d.k = 38; d.t0 = clock + 0.15 + i * 0.07; if (S.reduce) { d.a = d.tg; } }
        else d.a = d.tg = digits[i];
      }
      S.invalidate();
    };
    // add n digit-steps to each drum (ticks[i] is the count of increments of drum i)
    S.spin = function (ticks) {
      for (var i = 0; i < 7; i++) {
        var d = S.drums[i], tk = ticks[i]; if (!tk) continue;
        var steps = tk % 10 + 10 * Math.min(Math.floor(tk / 10), 3);
        d.tg += steps;
        if (S.reduce) { d.a = d.tg; d.v = 0; } else { d.k = steps > 14 ? 42 : 120; d.t0 = clock + (6 - i) * 0.06; }
      }
      S.invalidate();
    };

    var flow = window.Flow.create({
      full: opts.full,
      onGate: function (cnt, on) { if (opts.onGate) opts.onGate(cnt, on); },
      onWindow: function (total, cs, ev) { drawGauge(cs); upload(3, tGau, gauge.c); if (opts.onWindow) opts.onWindow(total, cs, ev); S.invalidate(); }
    });
    S.flow = flow; S.dayLen = flow.DAY; S.trap = 0; S.keep = 1.0;
    S.addBead = flow.addBead; S.seedTube = flow.seed;
    S.setGate = function (on) { flow.gateOn = on; };
    S.stepBeads = function (dt, now) { var m = flow.step(dt, now / 1000); S.trap = flow.trap; S.keep = flow.keep; return m; };
    S.packBeads = flow.pack;


    /* ---------- exploring: drag orbits, wheel zooms, shift or right drag pans, double click resets ---------- */
    var cur = null, tg = null, touched = false;
    var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
    function baseCam() { return portrait() ? { tx: 0.1, ty: 0.15, span: 9.9, yaw: 0.08, pit: 0.15 } : { tx: 0.1, ty: -0.06, span: 13.1, yaw: 0.08, pit: 0.15 }; }
    function resetCam() { tg = baseCam(); touched = false; S.invalidate(); }
    function limit() { tg.yaw = clamp(tg.yaw, -1.17, 1.17); tg.pit = clamp(tg.pit, -0.08, 1.05); tg.span = clamp(tg.span, 5, 15); tg.tx = clamp(tg.tx, -2.5, 2.5); tg.ty = clamp(tg.ty, -1.2, 1.8); touched = true; S.invalidate(); }
    function pan(dx, dy) { var k = tg.span / S.cssW; tg.tx -= Math.cos(tg.yaw) * dx * k; tg.ty += dy * k; limit(); }
    function orbit(dx, dy) { tg.yaw -= dx * 0.006; tg.pit += dy * 0.006; limit(); }
    var ptrs = {}, moved = 0, down = null;
    canvas.addEventListener('pointerdown', function (e) { if (e.button === 1) e.preventDefault(); interacting++; try { canvas.setPointerCapture(e.pointerId); } catch (err) { } ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = 0; down = { x: e.clientX, y: e.clientY, n: Object.keys(ptrs).length }; });
    canvas.addEventListener('pointermove', function (e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      var ids = Object.keys(ptrs), dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
      if (ids.length === 1) { if (e.shiftKey || (e.buttons & 6) || (e.ctrlKey && e.pointerType === 'mouse')) pan(dx, dy); else orbit(dx, dy); }
      else if (ids.length === 2) {
        var o = ptrs[ids.filter(function (i) { return +i !== e.pointerId; })[0]];
        var d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        if (d0 > 0) { tg.span *= d0 / d1; } pan(dx / 2, dy / 2); limit();
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    function up(e) {
      var wasOne = down && down.n === 1 && Object.keys(ptrs).length === 1;
      if (ptrs[e.pointerId]) interacting = Math.max(0, interacting - 1);
      delete ptrs[e.pointerId];
      if (e.type === 'pointerup' && wasOne && moved < 6 && !e.shiftKey && e.button === 0 && S.pick(e.clientX, e.clientY) && opts.onHatch) opts.onHatch();
    }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // wheel: a mouse wheel and a trackpad two-finger scroll both only zoom (dolly); a pinch zooms; panning is shift, right or middle drag
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey) tg.span *= Math.exp(e.deltaY * 0.01);
      else tg.span *= Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015));
      limit();
    }, { passive: false });
    var g0 = 1;
    canvas.addEventListener('gesturestart', function (e) { e.preventDefault(); g0 = tg.span; });
    canvas.addEventListener('gesturechange', function (e) { e.preventDefault(); tg.span = g0 / (e.scale || 1); limit(); });
    canvas.addEventListener('dblclick', function () { resetCam(); });
    canvas.addEventListener('keydown', function (e) {
      var s = e.shiftKey, k = e.key, used = true;
      if (k === 'ArrowLeft') (s ? pan(40, 0) : orbit(-14, 0)); else if (k === 'ArrowRight') (s ? pan(-40, 0) : orbit(14, 0));
      else if (k === 'ArrowUp') (s ? pan(0, 40) : orbit(0, -14)); else if (k === 'ArrowDown') (s ? pan(0, -40) : orbit(0, 14));
      else if (k === '+' || k === '=') { tg.span *= 0.88; limit(); } else if (k === '-' || k === '_') { tg.span *= 1.14; limit(); }
      else if (k === '0' || k === 'Home') resetCam(); else used = false;
      if (used) e.preventDefault();
    });
    // is the point under (x, y) the hatch in the plinth front?
    S.pick = function (x, y) {
      var c = S.lastCam; if (!c) return false;
      var asp = S.cssW / S.cssH, dist = c.span / (2 * 0.2493 * asp);
      var ro = [c.t[0] + dist * Math.sin(c.yaw) * Math.cos(c.pit), c.t[1] + dist * Math.sin(c.pit), c.t[2] + dist * Math.cos(c.yaw) * Math.cos(c.pit)];
      var fw = norm(sub(c.t, ro)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
      var xn = (x / S.cssW) * 2 - 1, yn = 1 - (y / S.cssH) * 2 - c.sh;
      var rd = [0, 1, 2].map(function (i) { return fw[i] + rt[i] * xn * asp * 0.2493 + up[i] * yn * 0.2493; });
      if (rd[2] >= 0) return false;
      var t = (0.9 - ro[2]) / rd[2], hx = ro[0] + rd[0] * t, hy = ro[1] + rd[1] * t;
      return Math.abs(hx - 2.2) < 0.45 && Math.abs(hy + 3.7) < 0.33;
    };
    S.resetCam = resetCam;
    S.drumDigits = function () { return S.drums.map(function (d) { return ((Math.round(d.tg) % 10) + 10) % 10; }); };
    S.camState = function () { return { target: JSON.parse(JSON.stringify(tg)), now: cur && JSON.parse(JSON.stringify(cur)) }; };
    if (/[?&]selfcheck\b/.test(location.search)) window.__scene = S;
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(canvas);
    S.resize = resize;
    resize();
    return S;
  }

  window.Scene = { create: create };
})();
