import { Router, Express } from "express";
import multer from "multer";
import {
  startWhatsAppClient,
  logoutWhatsAppClient,
  getWhatsAppStatus,
  getChats,
  getChatsAll,
  uploadTrainingScreenshots,
  getTrainingPrompt,
  updateBotConfig,
  getSchedules,
  addSchedule,
  removeSchedule,
  toggleSchedule
} from "./whatsappService";
import path from "path";

const upload = multer({ dest: path.join(process.cwd(), "uploads/") });

export function setupWhatsAppRoutes(app: Express) {
  const router = Router();

  router.post("/start", async (req, res) => {
    try {
      await startWhatsAppClient();
      res.json({ success: true, message: "WhatsApp client initialization started" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/logout", async (req, res) => {
    try {
      await logoutWhatsAppClient();
      res.json({ success: true, message: "WhatsApp client logged out" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/status", (req, res) => {
    res.json(getWhatsAppStatus());
  });

  router.get("/chats", (req, res) => {
    res.json(getChats());
  });

  router.get("/chats/all", async (req, res) => {
    const chats = await getChatsAll();
    res.json(chats);
  });

  router.get("/schedules", (req, res) => {
    res.json({ schedules: getSchedules() });
  });

  router.post("/schedules", (req, res) => {
    const schedule = addSchedule(req.body);
    res.json({ success: true, schedule });
  });

  router.delete("/schedules/:id", (req, res) => {
    removeSchedule(req.params.id);
    res.json({ success: true });
  });

  router.patch("/schedules/:id/toggle", (req, res) => {
    toggleSchedule(req.params.id, req.body.enabled);
    res.json({ success: true });
  });

  router.post("/config", (req, res) => {
    try {
      const config = req.body;
      const updatedConfig = updateBotConfig(config);
      res.json({ success: true, config: updatedConfig });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Upload training screenshots
  router.post("/train", upload.array("screenshots", 5), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No screenshots uploaded" });
      }

      await uploadTrainingScreenshots(files);
      res.json({ success: true, prompt: getTrainingPrompt() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/train", (req, res) => {
    res.json({ prompt: getTrainingPrompt() });
  });

  app.use("/api/whatsapp", router);
}
