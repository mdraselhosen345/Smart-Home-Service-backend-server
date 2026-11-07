import { Router } from "express";
import { z } from "zod";
import { ServiceRequest, SERVICE_STATUSES } from "../../models/ServiceRequest.js";
import { Complaint, COMPLAINT_STATUSES } from "../../models/Complaint.js";
import { Contact } from "../../models/Contact.js";
import { validate, validateId } from "../../middleware/validate.js";
import { serviceUpdateInput, complaintUpdateInput } from "../../schemas/index.js";
import { asyncHandler, ApiError } from "../../utils/asyncHandler.js";
import { getPaging, pagination, searchFilter, oneOf } from "../../utils/query.js";

const router = Router();

/** list / update / delete for a collection that has a status field. */
function statusResource(path, Model, { statuses, searchFields, updateSchema, label }) {
  router.get(
    path,
    asyncHandler(async (req, res) => {
      const paging = getPaging(req.query);
      const filter = {};
      const status = oneOf(req.query.status, statuses);
      if (status) filter.status = status;
      const search = searchFilter(req.query.search, searchFields);
      if (search) Object.assign(filter, search);

      const [items, total] = await Promise.all([
        Model.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
        Model.countDocuments(filter),
      ]);
      res.json({ success: true, data: items, pagination: pagination(paging, total) });
    })
  );

  router.patch(
    `${path}/:id`,
    validateId(),
    validate(updateSchema),
    asyncHandler(async (req, res) => {
      if (Object.keys(req.body).length === 0) throw new ApiError(400, "Nothing to update");
      const item = await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
      if (!item) throw new ApiError(404, `${label} not found`);
      res.json({ success: true, data: item });
    })
  );

  router.delete(
    `${path}/:id`,
    validateId(),
    asyncHandler(async (req, res) => {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) throw new ApiError(404, `${label} not found`);
      res.json({ success: true, message: `${label} deleted` });
    })
  );
}

statusResource("/services", ServiceRequest, {
  statuses: SERVICE_STATUSES,
  searchFields: ["name", "phone", "email", "serviceName", "category", "address"],
  updateSchema: serviceUpdateInput,
  label: "Service request",
});

statusResource("/complaints", Complaint, {
  statuses: COMPLAINT_STATUSES,
  searchFields: ["name", "phone", "email", "serviceName", "message"],
  updateSchema: complaintUpdateInput,
  label: "Complaint",
});

// Contact messages have a read/unread flag instead of a status.
router.get(
  "/contacts",
  asyncHandler(async (req, res) => {
    const paging = getPaging(req.query);
    const filter = {};
    if (req.query.unread === "true") filter.isRead = false;
    const search = searchFilter(req.query.search, ["name", "email", "phone", "subject", "message"]);
    if (search) Object.assign(filter, search);

    const [items, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
      Contact.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, pagination: pagination(paging, total) });
  })
);

router.patch(
  "/contacts/:id",
  validateId(),
  validate(z.object({ isRead: z.boolean() })),
  asyncHandler(async (req, res) => {
    const item = await Contact.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!item) throw new ApiError(404, "Message not found");
    res.json({ success: true, data: item });
  })
);

router.delete(
  "/contacts/:id",
  validateId(),
  asyncHandler(async (req, res) => {
    const item = await Contact.findByIdAndDelete(req.params.id);
    if (!item) throw new ApiError(404, "Message not found");
    res.json({ success: true, message: "Message deleted" });
  })
);

export default router;
