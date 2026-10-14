
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

try {
    const result = await cloudinary.api.ping();

    console.log("Cloudinary connection successful!");
    console.log(result);

} catch (error) {
    console.error("Cloudinary connection failed!");

    console.error("Message:", error?.message);
    console.error("HTTP Code:", error?.http_code);
}
