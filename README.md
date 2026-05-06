# pylamós

Plataforma web per aprendre Python. Els alumnes resolen exercicis que s'autocorregeixen, gràcies al feedback d'un professor virtual.

## Requisits

- **Python 3.11**
- **Node.js 18+**

## Backend (FastAPI)
### Prod cutre
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m pip install gunicorn uvicorn
#python3 -m gunicorn -k uvicorn.workers.UvicornWorker app.main:app -b 0.0.0.0:8000 -w 4
nohup python3 -m gunicorn -k uvicorn.workers.UvicornWorker app.main:app -b 0.0.0.0:8000 -w 2 > gunicorn.log 2>&1 &
echo $! > gunicorn.pid
```
### Dev
```bash
cd backend

# Crear entorn virtual
py -3.11 -m venv .venv

# Activar-lo
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/Mac:
# source .venv/bin/activate

# Instal·lar dependències
pip install -r requirements.txt

# Configurar .env (copiar i editar)
cp .env.example .env
# Posar la teva GEMINI_API_KEY i un JWT_SECRET_KEY segur

# Arrencar el servidor (port 8000, accessible a la LAN)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

L'aplicació crea la base de dades SQLite (`pylamos.db`) automàticament al primer arrencament i genera un usuari admin per defecte:
- **Usuari:** `admin`
- **Contrasenya:** `admin`

## Frontend (React + Vite)
### Prod cutre
```
cd frontend
npm install
npm run build
nohup npm run preview -- --host 0.0.0.0 --port 5000 > frontend.log 2>&1 &
echo $! > frontend.pid
```

### Dev
```bash
cd frontend

# Instal·lar dependències
npm install

# Arrencar el servidor de desenvolupament (port 5173, accessible a la LAN)
npm run dev
```

Obre [http://localhost:5173](http://localhost:5173) al navegador.
Des d'un altre dispositiu de la mateixa LAN, obre `http://IP_DEL_PC:5173`.

## Variables d'entorn (backend/.env)

| Variable | Descripció |
|---|---|
| `DATABASE_URL` | URL de la base de dades SQLite |
| `JWT_SECRET_KEY` | Clau secreta per als tokens JWT |
| `GEMINI_API_KEY` | Clau de l'API de Google Gemini |
| `CORS_ORIGINS` | Orígens permesos (per defecte `http://localhost:5173` i `http://127.0.0.1:5173`). Per LAN, afegeix també `http://IP_DEL_PC:5173` |
