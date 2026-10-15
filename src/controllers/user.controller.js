
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
// ============================================
// GENERATE ACCESS AND REFRESH TOKENS
// ============================================

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // Save refresh token in MongoDB
        user.refreshToken = refreshToken;

        await user.save({
            validateBeforeSave: false
        });

        return {
            accessToken,
            refreshToken
        };

    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        throw new ApiError(
            500,
            "Something went wrong while generating tokens"
        );
    }
};


// ============================================
// REGISTER USER
// ============================================

const registerUser = asyncHandler(async (req, res) => {

    const {
        fullName,
        email,
        username,
        password
    } = req.body;

    // Check required fields
    if (
        [fullName, email, username, password].some(
            (field) =>
                typeof field !== "string" ||
                field.trim() === ""
        )
    ) {
        throw new ApiError(
            400,
            "All fields are required"
        );
    }

    // Check if user already exists
    const existedUser = await User.findOne({
        $or: [
            {
                username: username.trim().toLowerCase()
            },
            {
                email: email.trim().toLowerCase()
            }
        ]
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with email or username already exists"
        );
    }

    // Create new user
    const user = await User.create({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        password,
        avatar: ""
    });

    // Remove sensitive information
    const createdUser = await User.findById(
        user._id
    ).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user"
        );
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully"
        )
    );
});


// ============================================
// LOGIN USER
// ============================================

const loginUser = asyncHandler(async (req, res) => {

    const {
        email,
        username,
        password
    } = req.body;

    // Check login credentials
    if (
        (!username && !email) ||
        typeof password !== "string" ||
        password.trim() === ""
    ) {
        throw new ApiError(
            400,
            "Email or username and password are required"
        );
    }

    if (
        (username !== undefined &&
            (typeof username !== "string" || !username.trim())) ||
        (email !== undefined &&
            (typeof email !== "string" || !email.trim()))
    ) {
        throw new ApiError(
            400,
            "Invalid email or username"
        );
    }

    // Find user by username or email
    const user = await User.findOne({
        $or: [
            ...(username
                ? [{
                    username: username.trim().toLowerCase()
                }]
                : []),

            ...(email
                ? [{
                    email: email.trim().toLowerCase()
                }]
                : [])
        ]
    });

    if (!user) {
        throw new ApiError(
            401,
            "Invalid credentials"
        );
    }

    // Verify password
    const isPasswordCorrect =
        await user.isPasswordCorrect(password);

        console.log("Password matched:", isPasswordCorrect);
    if (!isPasswordCorrect) {
        throw new ApiError(
            401,
            "Invalid credentials"
        );
    }

    // Generate JWT tokens
    const {
        accessToken,
        refreshToken
    } = await generateAccessAndRefreshTokens(user._id);

    // Get logged-in user without sensitive fields
    const loggedInUser = await User.findById(
        user._id
    ).select("-password -refreshToken");
    console.log("User found:", !!user);

    // Cookie configuration
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    };

    // Send response
    return res
        .status(200)
        .cookie(
            "accessToken",
            accessToken,
            options
        )
        .cookie(
            "refreshToken",
            refreshToken,
            options
        )
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken
                },
                "User logged in successfully"
            )
        );
});


// ============================================
// LOGOUT USER
// ============================================

const logoutUser = asyncHandler(async (req, res) => {

    // Remove refresh token from MongoDB
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    );

    // Cookie configuration
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    };

    // Clear authentication cookies
    return res
        .status(200)
        .clearCookie(
            "accessToken",
            options
        )
        .clearCookie(
            "refreshToken",
            options
        )
        .json(
            new ApiResponse(
                200,
                {},
                "User logged out successfully"
            )
        );
});

const refreshAccessToken = asyncHandler(async(req,res)=>
{
    const incomingRefreshToken = req.cookies.refreshAccessToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized request")
    }

    try {
        const decodedTOken = jwt.verify(
            incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET
        )
       const user = await User.findById(decodedTOken?._id)
        if(!user){
            throw new ApiError(401,"Invalid refresh token")
        }
    if(incomingRefreshToken !== user?.refreshToken){
        throw new ApiError(401,"Refresh token us expired or used")
    }
    
    const option={
        httpOnly : true,
        secure: true
    }
    const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    return res.status(200).cookie("accessToken",accessToken, options).cookie(
        "refreshToken",newRefreshToken,options
    ).json(
        new ApiResponse(
            200,{accessToken, refreshToken : newRefreshToken},
            "Access token refreshed successfully"
        )
    )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid refresh token")
    }

})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
};
