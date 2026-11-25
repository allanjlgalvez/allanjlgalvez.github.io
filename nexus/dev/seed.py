import json, urllib.request, http.cookiejar, io, random, uuid
from PIL import Image, ImageDraw, ImageFont
import os, sys
B=os.environ.get('NEXUS_URL','http://localhost:8790')
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(m,u,body=None,raw=None,ct='application/json'):
    data=json.dumps(body).encode() if body is not None else raw
    r=urllib.request.Request(B+u,data=data,method=m,headers={'X-Nexus':'1','Content-Type':ct})
    return json.loads(op.open(r).read())
call('POST','/api/setup',{'password':'prueba123'})
def img(text,c1,c2):
    im=Image.new('RGB',(600,600),c1); d=ImageDraw.Draw(im)
    for i in range(0,600,6): d.line([(0,i),(600,i)],fill=tuple(int(c1[k]+(c2[k]-c1[k])*i/600) for k in range(3)),width=6)
    d.ellipse([170,110,430,370],fill=(20,24,32)); d.ellipse([90,360,510,760],fill=(20,24,32))
    f=ImageFont.load_default(size=90); d.text((300,240),text,fill=c2,font=f,anchor='mm')
    b=io.BytesIO(); im.save(b,'JPEG',quality=85); return b.getvalue()
def upload(eid,data,foto=True):
    bd=uuid.uuid4().hex; parts=b''
    for name,fn,ct,val in [('file','foto.jpg','image/jpeg',data),('thumb','t.jpg','image/jpeg',data)]:
        parts+=f'--{bd}\r\nContent-Disposition: form-data; name="{name}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode()+val+b'\r\n'
    if foto: parts+=f'--{bd}\r\nContent-Disposition: form-data; name="foto"\r\n\r\n1\r\n'.encode()
    parts+=f'--{bd}--\r\n'.encode()
    return call('POST',f'/api/entities/{eid}/files',raw=parts,ct='multipart/form-data; boundary='+bd)
P,V,M=1,2,3
people=[
 ('Laura Méndez Ríos',['familia'],{'apodo':'Lau','fecha_nacimiento':'1962-11-28','tipo_sangre':'O+','alergias':'Penicilina','padecimientos':'Hipertensión controlada','medicamentos':'Losartán 50mg','telefono':'55 1234 5678','ocupacion':'Maestra jubilada'},((0,240,255),(255,42,109))),
 ('Roberto Méndez',['familia'],{'fecha_nacimiento':'1960-03-14','tipo_sangre':'A+','telefono':'55 2345 6789','ocupacion':'Ingeniero'},((249,158,26),(0,240,255))),
 ('Sofía Méndez',['familia'],{'fecha_nacimiento':'1990-12-02','tipo_sangre':'O+','email':'sofia@ejemplo.com','ocupacion':'Diseñadora','comida_favorita':'Sushi'},((255,42,109),(252,238,10))),
 ('Diego Méndez',['familia'],{'fecha_nacimiento':'1994-07-19','telefono':'55 9876 5432','ocupacion':'Estudiante de medicina'},((43,255,136),(0,240,255))),
 ('Carlos Ortega',['amigos','universidad'],{'fecha_nacimiento':'1991-12-10','telefono':'55 4567 1234','empresa':'Estudio Norte','como_nos_conocimos':'En la universidad, primer semestre.'},((120,80,255),(255,42,109))),
 ('Ana Torres',['amigos','trabajo'],{'fecha_nacimiento':'1993-02-25','telefono':'55 7777 1111','ocupacion':'Contadora'},((0,240,255),(252,238,10))),
 ('Martín Ruiz',['trabajo'],{'ocupacion':'Gerente','empresa':'Grupo Sigma'},None),
]
ids={}
for n,t,d,c in people:
    ids[n]=call('POST','/api/entities',{'type_id':P,'name':n,'tags':t,'data':d})['id']
    if c: upload(ids[n],img(''.join(w[0] for w in n.split()[:2]),*c))
cars=[('Jetta gris',{'marca':'Volkswagen','modelo':'Jetta','anio':2019,'color':'Gris','placas':'ABC-123-D','estado_placas':'CDMX'}),
      ('CR-V blanca',{'marca':'Honda','modelo':'CR-V','anio':2021,'color':'Blanca','placas':'XYZ-987-A','estado_placas':'Edo. Méx.'}),
      ('Moto Italika',{'marca':'Italika','modelo':'FT150','anio':2022,'color':'Roja','placas':'M12-AB'})]
for n,d in cars: ids[n]=call('POST','/api/entities',{'type_id':V,'name':n,'tags':[],'data':d})['id']
ids['Firulais']=call('POST','/api/entities',{'type_id':M,'name':'Firulais','tags':['familia'],'data':{'especie':'Perro','raza':'Labrador','fecha_nacimiento':'2018-12-01'}})['id']
rels=[('Laura Méndez Ríos','Roberto Méndez','es esposo(a) de'),('Laura Méndez Ríos','Sofía Méndez','es madre de'),('Laura Méndez Ríos','Diego Méndez','es madre de'),
 ('Roberto Méndez','Sofía Méndez','es padre de'),('Roberto Méndez','Diego Méndez','es padre de'),('Sofía Méndez','Diego Méndez','es hermano(a) de'),
 ('Carlos Ortega','Sofía Méndez','es amigo(a) de'),('Ana Torres','Carlos Ortega','es pareja de'),('Martín Ruiz','Ana Torres','trabaja con'),
 ('Roberto Méndez','Jetta gris','maneja'),('Laura Méndez Ríos','CR-V blanca','es dueño(a) de'),('Diego Méndez','Moto Italika','maneja'),('Firulais','Laura Méndez Ríos','es mascota de')]
for a,b,l in rels: call('POST','/api/relations',{'from_id':ids[a],'to_id':ids[b],'label':l})
for t,b,k,dt in [('Cumpleaños 60','Fiesta en casa, le regalamos un reloj.','evento','2022-11-28'),('Cita cardiólogo','Dr. Paredes. Todo estable, seguir con Losartán.','cita médica','2026-09-15'),('Idea de regalo','Le gustaría una cafetera italiana.','regalo','2026-10-30')]:
    call('POST',f"/api/entities/{ids['Laura Méndez Ríos']}/events",{'date':dt,'kind':k,'title':t,'body':b})
print(json.dumps(ids))
