"""Gate v2 (same pre-registered gate): temperature chosen by 5-class NLL on the 1,308 held-out
Messidor-2 images (calibration in the proper sense, so displayed confidences stay meaningful), then
ONLY the referable threshold is fitted (fit-fold sens >= 0.93) inside repeated 5-fold CV."""
import numpy as np, pandas as pd, json
from sklearn.model_selection import RepeatedStratifiedKFold
def sm(l,T):
    z=l/T; z=z-z.max(-1,keepdims=True); e=np.exp(z); return e/e.sum(-1,keepdims=True)
sp=pd.read_csv('outputs/messidor2_split.csv'); use=np.where(sp.split!='train')[0]
thrs=np.arange(0.02,0.8,0.005); res={}
for t in ('old','v2'):
    E=np.load(f'outputs/eval_{t}.npz'); l=E['messidor2_logits'][use]; g=E['messidor2_labels'][use]; y=g>=2
    Ts=np.arange(0.4,2.01,0.05)
    nll=[-np.log(np.clip(sm(l,T).mean(1)[np.arange(len(g)),g],1e-9,1)).mean() for T in Ts]
    T=float(Ts[int(np.argmin(nll))]); p=sm(l,T).mean(1)[:,2:].sum(1)
    def fit(idx):
        best=None
        for thr in thrs:
            r=p[idx]>thr
            if r[y[idx]].mean()>=0.93 and (best is None or (~r[~y[idx]]).mean()>best[0]): best=((~r[~y[idx]]).mean(),thr)
        return best
    S=[];C=[];rs=RepeatedStratifiedKFold(n_splits=5,n_repeats=5,random_state=42)
    for tr,te in rs.split(np.zeros(len(y)),y):
        b=fit(tr); r=p[te]>b[1]; S.append(r[y[te]].mean()); C.append((~r[~y[te]]).mean())
    b=fit(np.arange(len(y))); r=p>b[1]
    res[t]=dict(T=T,thr=float(b[1]),folds=len(S),cv_sens=float(np.mean(S)),cv_sens_sd=float(np.std(S)),cv_spec=float(np.mean(C)),cv_spec_sd=float(np.std(C)),insample_sens=float(r[y].mean()),insample_spec=float(r[~y].mean()==0 or (~r[~y]).mean()))
    print(t,json.dumps({k:(round(v,4) if isinstance(v,float) else v) for k,v in res[t].items()}))
g=res['v2']; ok=g['cv_sens']>=0.90 and g['cv_spec']>=0.85
print('GATE v2 (CV sens>=0.90 & spec>=0.85):','PASS' if ok else 'FAIL')
json.dump(res,open('outputs/cv_gate_result.json','w'),indent=2)
