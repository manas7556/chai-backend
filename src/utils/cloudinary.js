
import { v2 as cloudinary } from "cloudinary";
import fs from "node:fs/promises";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    if (!localFilePath) return null;

    try {
        const response = await cloudinary.uploader.upload(
            localFilePath,
            {
                resource_type: "auto"
            }
        );

        console.log(
            "Cloudinary upload successful:",
            response.secure_url
        );

        return response;

    } catch (error) {
        console.error("CLOUDINARY ERROR:", error);
        console.error("ERROR MESSAGE:", error?.message);

        throw new Error(
            error?.message || "Cloudinary upload failed"
        );

    } finally {
        try {
            await fs.unlink(localFilePath);
        } catch (error) {
            console.error(
                "Temporary file cleanup error:",
                error.message
            );
        }
    }
};

export { uploadOnCloudinary };
