"""Compare old / v1 / v2 checkpoints on held-out sets with an identical protocol:
T/threshold fitted ONLY on FGADR-val + Messidor-2 'cal' quarter (equal source weight,
sensitivity >= 0.92), tested on FGADR test, DDR eval sample, IDRiD, Messidor-2 'test' half."""
import numpy as np, pandas as pd
from sklearn.metrics import cohen_kappa_score
def sm(l,T):
    z=l/T; z=z-z.max(-1,keepdims=True); e=np.exp(z); return e/e.sum(-1,keepdims=True)
def probs(l,T): return sm(l,T).mean(1)
E={t:np.load(f'outputs/eval_{t}.npz') for t in ('old','new','v2')}
sp=pd.read_csv('outputs/messidor2_split.csv')
assert len(sp)==len(E['old']['messidor2_labels'])==len(E['v2']['messidor2_labels'])
assert (sp['label'].values==E['old']['messidor2_labels']).all()
cal=np.where(sp.split=='cal')[0]; tst=np.where(sp.split=='test')[0]
def get(t,name,sel=None):
    l=E[t][f'{name}_logits']; y=E[t][f'{name}_labels']
    return (l,y) if sel is None else (l[sel],y[sel])
def fit(t):
    parts=[get(t,'fgadr_val'),get(t,'messidor2',cal)]; best=None
    for T in np.arange(0.5,1.31,0.05):
        for thr in np.arange(0.05,0.8,0.01):
            se=[];spc=[]
            for l,y in parts:
                r=probs(l,T)[:,2:].sum(1)>thr; tr=y>=2
                se.append(r[tr].mean()); spc.append((~r[~tr]).mean())
            if np.mean(se)>=0.92 and (best is None or np.mean(spc)>best[0]): best=(np.mean(spc),T,thr,np.mean(se))
    return best
def metrics(l,y,T,thr):
    p=probs(l,T); pred=p.argmax(1); r=p[:,2:].sum(1)>thr; tr=y>=2
    rec=[round(float((pred[y==g]==g).mean()),2) for g in range(5)]
    return f"n={len(y):4d} qwk={cohen_kappa_score(y,pred,weights='quadratic'):.3f} acc={(pred==y).mean():.3f} mild={rec[1]:.2f} rec={rec} sens={r[tr].mean():.3f} spec={(~r[~tr]).mean():.3f}"
cfg={'old (deployed T=.80,thr=.27)':('old',0.80,0.27)}
for t,n in (('old','old'),('new','v1 (FGADR-only)'),('v2','v2 (mixed)')):
    f=fit(t); print(f'{n}: recalibrated T={f[1]:.2f} thr={f[2]:.2f} (cal sens={f[3]:.3f} spec={f[0]:.3f})'); cfg[f'{n} @ recal']=(t,f[1],f[2])
for name,sel in [('fgadr_test',None),('ddr',None),('idrid_all',None),('messidor2 TEST half',tst)]:
    print(f'\n=== {name} ===')
    key='messidor2' if name.startswith('messidor2') else name
    for k,(t,T,thr) in cfg.items():
        l,y=get(t,key,sel); print(f'{k:32s}',metrics(l,y,T,thr))
