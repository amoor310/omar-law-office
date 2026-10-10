import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import appointmentManagementRouter from "./appointment-management";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appointmentsRouter);
router.use(appointmentManagementRouter);

export default router;
