"""Build a bounded, measured MaleCNS circuit. Requires pyarrow/numpy; see docs.
The channel-to-cell-type mapping is engineered, NOT a biological receptive field.
Selection uses anatomy only, never Dino scores or evaluation seeds.
"""
from pathlib import Path
import json,hashlib,sys
import numpy as np
import pyarrow.feather as feather
root=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/pinfly-data')
expected={'annotations': '2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2', 'edges': 'e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1', 'neurotransmitters': '95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621'}
for name,digest in expected.items():
 if hashlib.file_digest((root/(name+'.feather')).open('rb'),'sha256').hexdigest()!=digest:raise ValueError('Source checksum mismatch: '+name)
rows=feather.read_table(root/'annotations.feather',columns=['bodyId','type','superclass','somaLocation']).to_pylist()
ann={r['bodyId']:r for r in rows if r['somaLocation']}
e=feather.read_table(root/'edges.feather');pre=e['body_pre'].to_numpy();post=e['body_post'].to_numpy();weight=e['weight'].to_numpy()
nt={r['body']:r['consensus_nt'] for r in feather.read_table(root/'neurotransmitters.feather',columns=['body','consensus_nt']).to_pylist()}
types=['LC4','LC11','LC9','LC15','LC16','LC17','LC21','LPLC2']
dn=np.array([i for i,r in ann.items() if r['superclass']=='descending_neuron'])
# Rank visual cells by their direct total synapse count onto descending cells.
md=np.isin(post,dn)
inputs=[];targets=[]
for channel,typ in enumerate(types):
 ids=np.array([i for i,r in ann.items() if r['type']==typ])
 ix=np.flatnonzero(np.isin(pre,ids)&md)
 strength={int(i):int(weight[ix[pre[ix]==i]].sum()) for i in np.unique(pre[ix])}
 chosen=sorted(strength,key=lambda i:(-strength[i],i))[:4]
 if len(chosen)<4:raise ValueError(typ)
 inputs.extend((i,channel) for i in chosen)
 jx=ix[np.isin(pre[ix],chosen)]
 ranks={int(i):int(weight[jx[post[jx]==i]].sum()) for i in np.unique(post[jx])}
 targets.extend(sorted(ranks,key=lambda i:(-ranks[i],i))[:2])
selected_inputs=[i for i,c in inputs]
ix=np.flatnonzero(np.isin(pre,selected_inputs)&md)
strength={int(i):int(weight[ix[post[ix]==i]].sum()) for i in np.unique(post[ix])}
targets=list(dict.fromkeys(targets))
for i in sorted(strength,key=lambda i:(-strength[i],i)):
 if len(targets)>=16:break
 if i not in targets:targets.append(i)
# Add 32 strongest two-hop bridge cells, scored by min(incoming, outgoing).
im=np.isin(pre,selected_inputs);om=np.isin(post,targets)
u,inv=np.unique(post[im],return_inverse=True);incoming=dict(zip(u,np.bincount(inv,weights=weight[im])))
u,inv=np.unique(pre[om],return_inverse=True);outgoing=dict(zip(u,np.bincount(inv,weights=weight[om])))
bridges=sorted((int(i) for i in incoming.keys()&outgoing.keys() if i in ann and i not in selected_inputs+targets),key=lambda i:(-min(incoming[i],outgoing[i]),i))[:32]
ids=sorted(set(selected_inputs+targets+bridges));idx={i:j for j,i in enumerate(ids)}
# Retain every measured internal edge, including recurrence, even one-contact edges.
mask=np.isin(pre,ids)&np.isin(post,ids)
edges=sorted([[idx[int(a)],idx[int(b)],int(w)] for a,b,w in zip(pre[mask],post[mask],weight[mask])])
# Sign convention is a simplified modeling assumption; unknown/modulatory = zero.
signs={'acetylcholine':1,'gaba':-1,'glutamate':-1}
graph={'version':'malecns-dino-circuit-v1','nodes':[{'id':i,'type':ann[i]['type'],'position':ann[i]['somaLocation'],'nt':nt.get(i),'sign':signs.get(nt.get(i),0),'role':'input' if i in selected_inputs else 'output' if i in targets else 'interneuron'} for i in ids],'edges':edges,'inputs':[[idx[i],c] for i,c in inputs],'outputs':[idx[i] for i in targets],'channels':types}
Path('src/data/connectome.json').write_text(json.dumps(graph,separators=(',',':'))+'\n')
manifest={'dataset':'FlyEM MaleCNS v1.0, min confidence 0.5','license':'CC BY 4.0','source':'https://male-cns.janelia.org/download/','nodes':len(ids),'edges':len(edges),'synapticContacts':sum(e[2] for e in edges),'inputCells':len(inputs),'readoutCells':len(targets),'graphSha256':hashlib.sha256(Path('src/data/connectome.json').read_bytes()).hexdigest(),'sources':{p:hashlib.file_digest((root/(p+'.feather')).open('rb'),'sha256').hexdigest() for p in ['annotations','edges','neurotransmitters']},'selection':'4 visual cells per each of 8 named types ranked by direct DN contacts; union of top 2 DN targets per type, filled to 16 by contact rank; top 32 two-hop bridge cells by minimum incoming/outgoing contact strength; all measured internal directed edges retained. Ties by body ID. No game outcomes used.','assumptions':'Engineered 8-channel input injection; simplified signed, normalized, leaky tanh rate units. Acetylcholine +1, GABA/glutamate -1; unknown and modulatory transmitters 0. Not a physiological or whole-brain model.'}
Path('public/data/connectome').mkdir(exist_ok=True)
Path('public/data/connectome/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
Path('public/data/connectome/graph.json').write_bytes(Path('src/data/connectome.json').read_bytes())
print(json.dumps(manifest,indent=2))
print('outputs',[(ann[i]['type'],i) for i in targets])
