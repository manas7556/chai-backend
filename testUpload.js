
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

try {
    const result = await cloudinary.uploader.upload(
        "./public/temp/test.jpeg",
        {
            resource_type: "image"
        }
    );

    console.log("Upload successful!");
    console.log("Image URL:", result.secure_url);

} catch (error) {
    console.error("Upload failed!");
    console.error("Message:", error?.message);
    console.error("HTTP Code:", error?.http_code);
    console.error("Full error:", error);
}
