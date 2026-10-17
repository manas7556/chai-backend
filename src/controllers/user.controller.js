
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
};

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;

        await user.save({
            validateBeforeSave: false
        });

        return { accessToken, refreshToken };
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

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, username, password } = req.body ?? {};

    if (
        [fullName, email, username, password].some(
            (field) =>
                typeof field !== "string" ||
                field.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const existedUser = await User.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail }
        ]
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with email or username already exists"
        );
    }

    const user = await User.create({
        fullName: fullName.trim(),
        email: normalizedEmail,
        username: normalizedUsername,
        password,
        avatar: ""
    });

    const createdUser = await User.findById(user._id)
        .select("-password -refreshToken");

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

const loginUser = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body ?? {};

    if (
        (!username && !email) ||
        typeof password !== "string" ||
        !password.trim()
    ) {
        throw new ApiError(
            400,
            "Email or username and password are required"
        );
    }

    const conditions = [];

    if (typeof username === "string" && username.trim()) {
        conditions.push({
            username: username.trim().toLowerCase()
        });
    }

    if (typeof email === "string" && email.trim()) {
        conditions.push({
            email: email.trim().toLowerCase()
        });
    }

    if (conditions.length === 0) {
        throw new ApiError(400, "Invalid email or username");
    }

    const user = await User.findOne({
        $or: conditions
    });

    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }

    const isPasswordCorrect =
        await user.isPasswordCorrect(password);

    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid credentials");
    }

    const { accessToken, refreshToken } =
        await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id)
        .select("-password -refreshToken");

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
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

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        }
    );

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(
            new ApiResponse(
                200,
                {},
                "User logged out successfully"
            )
        );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    let decodedToken;

    try {
        decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );
    } catch (error) {
        throw new ApiError(
            401,
            "Invalid or expired refresh token"
        );
    }

    const user = await User.findById(decodedToken?._id);

    if (!user) {
        throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
        throw new ApiError(
            401,
            "Refresh token is expired or already used"
        );
    }

    const { accessToken, refreshToken } =
        await generateAccessAndRefreshTokens(user._id);

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                { accessToken },
                "Access token refreshed successfully"
            )
        );
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body ?? {};

    if (
        typeof oldPassword !== "string" ||
        !oldPassword ||
        typeof newPassword !== "string" ||
        !newPassword
    ) {
        throw new ApiError(
            400,
            "Old password and new password are required"
        );
    }

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isPasswordCorrect =
        await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(401, "Old password is incorrect");
    }

    if (oldPassword === newPassword) {
        throw new ApiError(
            400,
            "New password must be different"
        );
    }

    user.password = newPassword;
    user.refreshToken = undefined;

    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(
            new ApiResponse(
                200,
                {},
                "Password changed successfully. Please log in again."
            )
        );
});

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .select("-password -refreshToken");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            "Current user fetched successfully"
        )
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body ?? {};

    if (fullName === undefined && email === undefined) {
        throw new ApiError(
            400,
            "At least one field is required to update"
        );
    }

    const updates = {};

    if (fullName !== undefined) {
        if (
            typeof fullName !== "string" ||
            !fullName.trim()
        ) {
            throw new ApiError(400, "Invalid full name");
        }

        updates.fullName = fullName.trim();
    }

    if (email !== undefined) {
        if (
            typeof email !== "string" ||
            !email.trim()
        ) {
            throw new ApiError(400, "Invalid email");
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await User.findOne({
            email: normalizedEmail,
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            throw new ApiError(
                409,
                "Email is already in use"
            );
        }

        updates.email = normalizedEmail;
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: updates
        },
        {
            new: true,
            runValidators: true
        }
    ).select("-password -refreshToken");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            "Account details updated successfully"
        )
    );
});

const updateUserAccount = updateAccountDetails;

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAccount
};
