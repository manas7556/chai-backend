
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
const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body

    const user = await User.findById(req.user._id)
    const isPaswordCorrect= await user.isPasswordCorrect(oldPassword)

    if(!isPaswordCorrect){
        throw new ApiError(401,"Old password is incorrect")
    }

  user.password = newPassword
  await user.save({validateBeforeSave:false})
   
  return res.status(200).json(
    new ApiResponse(
        200,{}, "Password changed successfully"
    )
  )
})


const getCurrentUser = asyncHandler(async(req,res)=>{
    res.status(200).json(
        new ApiResponse(
            200,req.user,"Current user fetched successfully"
        )
    )
})
const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName,email,username} = req.body

    if(!fullName && !email){
        throw new ApiError(400,"At least one field is required to update")
    }
const user =
 User.findByIdAndUpdate(req.user?._id,{
  
    $set:{
        fullName : fullName,
        email: email
 }},{new:true}).select("-password")

 return res.status(200).json(
    new ApiResponse(
        200,user,"Account details updated successfully"
    )
 )
});

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.files?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is missing")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatar){
        throw new ApiError(500,"error while uploading avatar")
    }
   const user = await User.findByIdAndUpdate(req.user?._id,{
        $set:{
            avatar:avatar.url
        }
    },{new:true}).select("-password")

    return res.status(200).json(
        new ApiResponse(
            200,user,"Avatar image updated successfully"
        )
    )
})
 
const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath){
        throw new ApiError(400," cover image is missing")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!avatar){
        throw new ApiError(500,"error while uploading coverImage")
    }
    const user = await User.findByIdAndUpdate(req.user?._id,{
        $set:{
            coverImage:coverImage.url
        }
    },{new:true}).select("-password")

    return res.status(200).json(
        new ApiResponse(
            200,user,"cover image updated successfully"
        )
    )
})

const getUserChannelProfile = asyncHandler(async(req,res)=>{

const {username} = req.params
if(!username?.trim()){

    throw new ApiError(400,"username is required")

}

const channel = await User.aggregate([
    {
        $match:{
            username:username?.toLowerCase()
        }
    },
    {
        $lookup:{
            from:"subscription",
            localField:"_id",
            foreignField:"channel",
            as:"subscribers"
        }
    },
    {
        $lookup:{
            from:"subscription",
            localField:"_id",
            foreignField:"subscriber",
            as:"subscriptiondTo"
        }
    },
    {
        $addFields:{
            subscriberCount:{
                $size:"$subscribers"
            },
            channelSubscribedToCount:{
                $size:"$subscriptiondTo"
            },
            isSubscribed:{
                $cond:{
                   if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                   then:true,
                   else:false

                }
            }
    }
},
{
    $project:{
        fullName:1,
        username:1,
        subscriberCount:1,
        channelSubscribedToCount:1,
        isSubscribed:1,
        avatar:1,
        coverImage:1,
        email:1,
    }
}
])
 if(!channel?.length){
    throw new ApiError(404,"Channel not found")
 }
return res.status(200).json(
    new ApiResponse(
        200,channel[0],"Channel profile fetched successfully"
    )
)

})

const getWatchHistory = asyncHandler(async(req,res)=>{
const user = await User.aggregate([
    {
        $match:{
            _id:new mongoose.Types.ObjectId(req.user?._id)
        }
    },
    {
        $lookup:{
            from:"videos",
            localField:"_watchhistory",
            foreignField:"_id",
            as:"watchHistory",
            pipeline:[
                {
                    $lookup:{
                        from:"users",
                        localField:"owner",
                        foreignField:"_id",
                        as:"owner",
                        pipeline:[
                            {
                                $project:{
                                    fullName:1,
                                    username:1,
                                    avatar:1
                                }
                             },
                             {
                                $addFields:{
                                    owner:{
                                        $first:"$owner"
                                    }
                                }
                             }
                        ]
                    }
                }
            ]
        }
}  
  
])
return res.status(200).json(
    new ApiResponse(
        200,user[0].wathchHistory,"Watch history fetched successfully"
    )
)
 })

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getCurrentUser,
    changeCurrentPassword,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
};
