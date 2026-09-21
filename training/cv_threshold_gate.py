"""Gated threshold refit. PRE-REGISTERED gate: v2 ships only if repeated 5-fold CV on the
1,308 held-out Messidor-2 images (cal+test; the 436 'train' images are excluded, v2 trained on
them) gives mean sensitivity >= 0.90 AND mean specificity >= 0.85 at a threshold fitted on the
fit folds with a 3-pt margin (fit-fold sensitivity >= 0.93). Same procedure run for the old model."""
import numpy as np, pandas as pd, json
from sklearn.model_selection import RepeatedStratifiedKFold
def sm(l,T):
    z=l/T; z=z-z.max(-1,keepdims=True); e=np.exp(z); return e/e.sum(-1,keepdims=True)
sp=pd.read_csv('outputs/messidor2_split.csv'); use=np.where(sp.split!='train')[0]
Ts=np.arange(0.5,1.61,0.05); thrs=np.arange(0.05,0.8,0.01)
def curves(t):
    E=np.load(f'outputs/eval_{t}.npz'); l=E['messidor2_logits'][use]; y=E['messidor2_labels'][use]>=2
    # sens/spec grid per (T,thr) as arrays over samples: precompute referable prob per T
    P=np.stack([sm(l,T).mean(1)[:,2:].sum(1) for T in Ts]); return P,y
def fit(P,y,idx,margin):
    best=None
    for i,T in enumerate(Ts):
        p=P[i][idx]; yy=y[idx]
        for thr in thrs:
            r=p>thr; se=r[yy].mean(); spc=(~r[~yy]).mean()
            if se>=margin and (best is None or spc>best[0]): best=(spc,i,thr)
    return best
def ev(P,y,idx,i,thr):
    r=P[i][idx]>thr; yy=y[idx]; return r[yy].mean(),(~r[~yy]).mean()
out={}
for t in ('old','v2'):
    P,y=curves(t); rs=RepeatedStratifiedKFold(n_splits=5,n_repeats=5,random_state=42)
    S=[];C=[]
    for tr,te in rs.split(np.zeros(len(y)),y):
        b=fit(P,y,tr,0.93)
        if b is None: continue
        se,spc=ev(P,y,te,b[1],b[2]); S.append(se); C.append(spc)
    b=fit(P,y,np.arange(len(y)),0.93)
    out[t]=dict(cv_sens=float(np.mean(S)),cv_sens_sd=float(np.std(S)),cv_spec=float(np.mean(C)),cv_spec_sd=float(np.std(C)),
                final_T=float(Ts[b[1]]),final_thr=float(b[2]),insample_spec=float(b[0]),n=int(len(y)),n_pos=int(y.sum()))
    print(t,json.dumps(out[t],indent=None))
g=out['v2']; ok=g['cv_sens']>=0.90 and g['cv_spec']>=0.85
print('\nGATE (CV sens>=0.90 and spec>=0.85):', 'PASS' if ok else 'FAIL')
json.dump(out,open('outputs/cv_gate_result.json','w'),indent=2)
