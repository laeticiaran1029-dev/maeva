import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for club presence (since Firebase was declined)
  // In a real app, this would be a database.
  let attendance: any[] = [];
  let events: any[] = [
    { id: '1', title: 'Weekly Coding Workshop', date: new Date().toISOString(), description: 'Learn React and Tailwind' },
    { id: '2', title: 'Club Social Mixer', date: new Date(Date.now() + 86400000 * 2).toISOString(), description: 'Meet other members' }
  ];

  // Start with an empty members list
  let members: any[] = [];

  // API Routes
  app.get("/api/events", (req, res) => {
    res.json(events);
  });

  app.get("/api/members", (req, res) => {
    res.json(members);
  });

  app.get("/api/members/:id", (req, res) => {
    const { id } = req.params;
    const member = members.find(m => m.id === id);
    if (!member) return res.status(404).json({ error: "Member not found" });
    res.json(member);
  });

  app.post("/api/members", (req, res) => {
    const { name, email, role, id } = req.body;
    if (!name || !email || !id) {
      return res.status(400).json({ error: "Name, email, and ID are required" });
    }

    // Check if ID already exists
    if (members.some(m => m.id === id)) {
      return res.status(400).json({ error: "Cet ID est déjà utilisé." });
    }

    const newMember = {
      id,
      name,
      email,
      role: role || 'Volunteer',
      codeRequested: false
    };
    members.push(newMember);
    res.json({ success: true, member: newMember });
  });

  app.post("/api/members/request-code", (req, res) => {
    const { id } = req.body;
    const member = members.find(m => m.id === id);
    if (!member) {
      return res.status(404).json({ error: "Membre non trouvé." });
    }
    member.codeRequested = true;
    res.json({ success: true });
  });

  app.post("/api/admin/assign-code", (req, res) => {
    const { id, code } = req.body;
    const member = members.find(m => m.id === id);
    if (!member) {
      return res.status(404).json({ error: "Membre non trouvé." });
    }
    member.presenceCode = code;
    member.codeRequested = false;
    member.message = `Votre code de présence est : ${code}`;
    res.json({ success: true });
  });

  app.post("/api/check-in", (req, res) => {
    const { presenceCode, eventId } = req.body;
    if (!presenceCode || !eventId) {
      return res.status(400).json({ error: "Code de présence et ID d'événement requis" });
    }

    // Find member by presence code
    const member = members.find(m => m.presenceCode === presenceCode);
    if (!member) {
      return res.status(404).json({ error: "Code de présence invalide." });
    }

    // Check if already checked in for this event
    if (attendance.some(r => r.studentId === member.id && r.eventId === eventId)) {
      return res.status(400).json({ error: "Vous êtes déjà pointé pour cet événement." });
    }

    const record = {
      id: Math.random().toString(36).substr(2, 9),
      studentName: member.name,
      studentId: member.id,
      eventId,
      timestamp: new Date().toISOString(),
      verified: true // Code entry counts as verified
    };
    attendance.push(record);
    res.json({ success: true, record });
  });

  app.post("/api/verify", (req, res) => {
    const { studentId, eventId } = req.body;
    if (!studentId || !eventId) {
      return res.status(400).json({ error: "Missing studentId or eventId" });
    }
    
    // Find existing record or create a new verified one
    let record = attendance.find(r => r.studentId === studentId && r.eventId === eventId);
    if (record) {
      record.verified = true;
    } else {
      const member = members.find(m => m.id === studentId);
      record = {
        id: Math.random().toString(36).substr(2, 9),
        studentName: member ? member.name : "Verified Student",
        studentId,
        eventId,
        timestamp: new Date().toISOString(),
        verified: true
      };
      attendance.push(record);
    }
    res.json({ success: true, record });
  });

  app.post("/api/unverify", (req, res) => {
    const { studentId, eventId } = req.body;
    attendance = attendance.filter(r => !(r.studentId === studentId && r.eventId === eventId));
    res.json({ success: true });
  });

  app.get("/api/attendance", (req, res) => {
    res.json(attendance);
  });

  app.post("/api/events", (req, res) => {
    const { title, date, description } = req.body;
    if (!title || !date) {
      return res.status(400).json({ error: "Title and date are required" });
    }
    const newEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      date,
      description: description || ''
    };
    events.push(newEvent);
    res.json({ success: true, event: newEvent });
  });

  app.put("/api/events/:id", (req, res) => {
    const { id } = req.params;
    const { title, date, description } = req.body;
    const index = events.findIndex(e => e.id === id);
    if (index === -1) return res.status(404).json({ error: "Event not found" });
    
    events[index] = { ...events[index], title, date, description };
    res.json({ success: true, event: events[index] });
  });

  app.delete("/api/events/:id", (req, res) => {
    const { id } = req.params;
    events = events.filter(e => e.id !== id);
    // Also cleanup attendance
    attendance = attendance.filter(a => a.eventId !== id);
    res.json({ success: true });
  });

  app.put("/api/members/:id", (req, res) => {
    const { id } = req.params;
    const { name, email, role, presenceCode } = req.body;
    const index = members.findIndex(m => m.id === id);
    if (index === -1) return res.status(404).json({ error: "Member not found" });
    
    members[index] = { ...members[index], name, email, role, presenceCode };
    res.json({ success: true, member: members[index] });
  });

  app.delete("/api/members/:id", (req, res) => {
    const { id } = req.params;
    members = members.filter(m => m.id !== id);
    // Also cleanup attendance
    attendance = attendance.filter(a => a.studentId !== id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
